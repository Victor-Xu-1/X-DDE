"""DELi UMI counting is grouped by exact sample/library/member, with bounded per-member memory."""

import importlib.metadata
import itertools
import sqlite3
from collections import Counter

from del_umi import counting_summary, summary, umi_status
from platformnative_io import finish, progress, readonly_database, source_result, write_csv


def run(request):
    from deli.decode.count import corrected_count, dedup_count, raw_count

    root, result = source_result(request)
    original = readonly_database(root / "decoded.sqlite")
    output = sqlite3.connect("/output/counts.sqlite")
    output.executescript("""
        CREATE TABLE members (id TEXT PRIMARY KEY, library TEXT, cycles TEXT, smiles TEXT);
        CREATE TABLE counts (member TEXT, sample TEXT, raw INTEGER NOT NULL,
          unique_umi INTEGER, corrected_umi INTEGER, eligible_reads INTEGER,
          excluded_reads INTEGER, PRIMARY KEY(member,sample));
        CREATE INDEX sample_counts ON counts(sample,member);
    """)
    options, total, members = request["payload"], 0, 0
    eligible_total, excluded_total = 0, 0
    reads_by_status, records_by_status = Counter(), Counter()
    try:
        integrity = counting_summary(
            result.get("metadata", {}), result["counts"], options["umi_method"]
        )
        rows = original.execute("SELECT * FROM reads ORDER BY sample,library,member,umi")
        for key, group in itertools.groupby(
            rows, key=lambda row: (row["sample"], row["library"], row["member"])
        ):
            umis, complete, cycles = {}, {}, None
            for row in group:
                if len(umis) >= options["max_umis_per_member"]:
                    raise ValueError("A member exceeds the selected per-compound UMI work budget.")
                if cycles is not None and cycles != row["cycles"]:
                    raise ValueError("A decoded member has conflicting building-block identities.")
                cycles = row["cycles"]
                umis[row["umi"]] = row["count"]
                if integrity is not None:
                    lengths = integrity["expected_lengths"]
                    if row["library"] not in lengths:
                        raise ValueError("The decoded UMI assessment omits an observed library.")
                    expected = lengths[row["library"]]
                    state = umi_status(row["umi"], expected)
                    if "umi_status" not in row.keys() or row["umi_status"] != state:
                        raise ValueError(
                            "A decoded UMI differs from its original schema assessment."
                        )
                    reads_by_status[state] += row["count"]
                    records_by_status[state] += 1
                    if state == "complete":
                        complete[row["umi"]] = row["count"]
            raw = raw_count(umis)
            eligible = (raw_count(complete) if complete else 0) if integrity is not None else None
            excluded = raw - eligible if eligible is not None else None
            unique = (
                (dedup_count(complete) if complete else 0)
                if options["umi_method"] != "raw"
                else None
            )
            corrected = (
                (corrected_count(complete, method=options["umi_method"]) if complete else 0)
                if options["umi_method"] in {"directional", "cluster"}
                else None
            )
            if corrected is not None and not 0 <= corrected <= unique <= eligible <= raw:
                raise ValueError(
                    "Native UMI correction does not reconcile with the observed reads."
                )
            sample, library, member = key
            output.execute(
                "INSERT OR IGNORE INTO members VALUES (?,?,?,NULL)", (member, library, cycles)
            )
            output.execute(
                "INSERT INTO counts VALUES (?,?,?,?,?,?,?)",
                (member, sample, raw, unique, corrected, eligible, excluded),
            )
            total += raw
            eligible_total += eligible or 0
            excluded_total += excluded or 0
            members += 1
            if members % 5000 == 0:
                output.commit()
                progress("Counting compound-scoped UMIs", members)
        output.commit()
        if total != result["counts"]["decoded_reads"]:
            raise ValueError("Counted DEL reads differ from their exact decoded evidence.")
        if integrity is not None and integrity != summary(
            integrity["expected_lengths"], reads_by_status, records_by_status
        ):
            raise ValueError("Counted UMI completeness differs from the exact decoded evidence.")
        write_csv(
            "/output/compound-counts.csv",
            [
                "member",
                "sample",
                "raw",
                "unique_umi",
                "corrected_umi",
                "eligible_reads",
                "excluded_reads",
            ],
            output.execute("SELECT * FROM counts ORDER BY member,sample"),
        )
        sample_totals = {
            row[0]: {
                "raw": row[1],
                "unique_umi": row[2],
                "corrected_umi": row[3],
                "eligible_umi_reads": row[4],
                "excluded_umi_reads": row[5],
            }
            for row in output.execute(
                "SELECT sample,SUM(raw),SUM(unique_umi),SUM(corrected_umi),"
                "SUM(eligible_reads),SUM(excluded_reads) "
                "FROM counts GROUP BY sample"
            )
        }
        number = output.execute("SELECT COUNT(*) FROM members").fetchone()[0]
    finally:
        output.close()
        original.close()
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "counts",
        {
            "counts.sqlite": "compound_count_matrix",
            "compound-counts.csv": "compound_sample_counts",
        },
        counts={
            "counted_reads": total,
            "observed_members": number,
            "member_sample_pairs": members,
            "samples": len(sample_totals),
            **(
                {"complete_umi_reads": eligible_total, "excluded_umi_reads": excluded_total}
                if integrity is not None
                else {}
            ),
        },
        metadata={
            "sample_totals": sample_totals,
            "umi_method": options["umi_method"],
            "scope": "PCR/UMI evidence; not binding affinity",
            "umi_integrity": integrity,
        },
    )
