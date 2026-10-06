"""The official DELi SelectionDecoder streams into compound/sample-scoped UMI evidence."""

import importlib.metadata
import json
import sqlite3
from collections import Counter
from pathlib import Path

from del_decoder_compat import reviewed_decoder
from del_definition import prepare_home
from del_fastq import Quality
from del_read_pairs import observations
from platformnative_io import finish, input_file, progress, source_result, write_csv


def run(request):
    from deli.decode.decoder import DecodedCollectionCompound, DecodingSettings, SelectionDecoder
    from deli.dels.combinatorial import DELibraryCollection
    from deli.dels.compound import generate_del_compound_id
    from deli.selection import Selection
    from dnaio import SequenceRecord

    root, _ = source_result(request)
    definition = json.loads((root / "del-definition.json").read_text())
    libraries = prepare_home(definition)
    options = request["payload"]
    settings = DecodingSettings(
        revcomp=options["reverse_complement"],
        library_error_tolerance=options["library_errors"],
        library_error_correction_mode_str=f"levenshtein_dist:{options['library_errors']},asymmetrical",
        default_error_correction_mode_str=f"levenshtein_dist:{options['barcode_errors']},asymmetrical",
        decode_matching_approach="search_all",
        min_library_overlap=options["min_library_overlap"],
        min_read_length=options["min_read_length"],
        max_read_length=options["max_read_length"],
    )
    decoder = reviewed_decoder(
        SelectionDecoder(
            Selection("X-DDE", DELibraryCollection(list(libraries.values()))), settings
        )
    )
    inputs = [item for item in request["inputs"] if item["role"] == "reads"]
    if len({item["label"] for item in inputs}) != len(inputs):
        raise ValueError("Sequencing file labels must be unique.")
    sample_groups = {}
    for sample in options["read_samples"]:
        sample_groups.setdefault(sample["input_label"], []).append(sample)
    if set(sample_groups) != {item["label"] for item in inputs}:
        raise ValueError("Every sequencing file must have an explicit sample assignment.")
    for samples in sample_groups.values():
        barcodes = [sample["sample_barcode"] for sample in samples]
        if len(barcodes) != len(set(barcodes)) or (len(barcodes) > 1 and "" in barcodes):
            raise ValueError("Multiplexed samples need distinct explicit barcode prefixes.")
        if any(
            a.startswith(b) or b.startswith(a)
            for index, a in enumerate(barcodes)
            for b in barcodes[index + 1 :]
        ):
            raise ValueError("Sample barcode prefixes are ambiguous.")
        if (
            len(
                {
                    (sample.get("mate_label", ""), sample.get("encoded_mate", "r1"))
                    for sample in samples
                }
            )
            != 1
        ):
            raise ValueError(
                "Samples sharing a multiplexed file need the same paired-read strategy."
            )
    database = sqlite3.connect("/output/decoded.sqlite")
    database.execute("PRAGMA cache_size=-16384")
    database.executescript("""
        CREATE TABLE reads (sample TEXT,library TEXT,member TEXT,cycles TEXT,umi TEXT,count INTEGER,
          PRIMARY KEY(sample,library,member,umi));
        CREATE INDEX member_umi ON reads(sample,library,member);
        CREATE TABLE failures (reason TEXT PRIMARY KEY, count INTEGER NOT NULL);
    """)
    reasons, qc, total, decoded, corrected = Counter(), Quality(), 0, 0, 0
    byte_budget = {"remaining": options["expanded_bytes"]}
    try:
        positions = {item["label"]: position for position, item in enumerate(inputs)}
        for position, item in enumerate(inputs):
            if item["label"] not in sample_groups:
                continue
            path, _ = input_file(request, "reads", position)
            strategy = sample_groups[item["label"]][0]
            mate_label = strategy.get("mate_label", "")
            mate = input_file(request, "reads", positions[mate_label])[0] if mate_label else None
            for read in observations(
                path, mate, {**options, **strategy, "byte_budget": byte_budget}
            ):
                total += 1
                if total > options["max_reads"]:
                    raise ValueError("The FASTQ inputs exceed the confirmed read budget.")
                mean_quality = qc.add(read)
                if mean_quality < options["min_mean_quality"]:
                    reasons["below_selected_mean_quality"] += 1
                    continue
                chosen = [
                    sample
                    for sample in sample_groups[item["label"]]
                    if read.sequence.startswith(sample["sample_barcode"])
                ]
                if len(chosen) != 1:
                    reasons["unassigned_sample_barcode"] += 1
                    continue
                sample = chosen[0]
                prefix = len(sample["sample_barcode"])
                barcode = SequenceRecord(read.name, read.sequence[prefix:], read.qualities[prefix:])
                outcome = decoder.decode_read(barcode)
                if not isinstance(outcome, DecodedCollectionCompound):
                    reasons[type(outcome).__name__] += 1
                    continue
                row = outcome.to_decode_res_row_dict()
                library = row["library_id"]
                blocks = row.get("bb_ids", "").split(",")
                if (
                    not blocks
                    or library not in libraries
                    or len(blocks) != libraries[library].num_cycles
                ):
                    raise ValueError(
                        "Native decoded member identities differ from the chosen DEL definition."
                    )
                member = generate_del_compound_id(library, blocks)
                umi = row.get("umi", "") or ""
                if umi and (set(umi) - set("ACGT") or len(umi) > 64):
                    reasons["invalid_or_ambiguous_umi"] += 1
                    continue
                database.execute(
                    "INSERT INTO reads VALUES (?,?,?,?,?,1) ON CONFLICT(sample,library,member,umi) "
                    "DO UPDATE SET count=count+1",
                    (sample["sample"], library, member, json.dumps(blocks), umi),
                )
                decoded += 1
                corrected += outcome.get_overall_score() > 0
                if total % 5000 == 0:
                    database.commit()
                    progress("Decoding DEL barcodes", total)
        for reason, count in reasons.items():
            database.execute("INSERT INTO failures VALUES (?,?)", (reason, count))
        database.commit()
        if total != decoded + sum(reasons.values()) or not total:
            raise ValueError("Raw DEL reads do not reconcile with decoded and rejected reads.")
        grouped = database.execute("SELECT COUNT(*) FROM reads").fetchone()[0]
        write_csv("/output/decode-failures.csv", ["reason", "reads"], sorted(reasons.items()))
    finally:
        database.close()
    Path("/output/sequencing-qc.json").write_text(
        json.dumps(
            {
                **qc.result(),
                "decoded": decoded,
                "decoded_with_errors": corrected,
                "failures": dict(reasons),
                "sample_assignment": options["read_samples"],
                "umi_scope": "within_sample_and_compound",
                "trimming": "none; the native DEL barcode schema is preserved",
                "paired_reads": "one confirmed code-bearing mate per matched pair",
            }
        )
    )
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "decoded",
        {
            "decoded.sqlite": "decoded_umi_evidence",
            "sequencing-qc.json": "sequencing_quality",
            "decode-failures.csv": "decode_failure_counts",
        },
        counts={
            "input_reads": total,
            "decoded_reads": decoded,
            "rejected_reads": total - decoded,
            "decoded_with_errors": corrected,
            "distinct_umi_records": grouped,
        },
        metadata={
            "samples": sorted({sample["sample"] for sample in options["read_samples"]}),
            "definition": request["sources"][0],
            "method": "DELi.SelectionDecoder.search_all",
        },
    )
