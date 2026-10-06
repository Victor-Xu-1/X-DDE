"""DELi UMI counting is grouped by exact sample/library/member, with bounded per-member memory."""

import importlib.metadata
import itertools
import sqlite3

from platformnative_io import finish, progress, readonly_database, source_result, write_csv


def run(request):
    from deli.decode.count import corrected_count, dedup_count, raw_count

    root, result = source_result(request)
    original = readonly_database(root / "decoded.sqlite")
    output = sqlite3.connect("/output/counts.sqlite")
    output.executescript("""
        CREATE TABLE members (id TEXT PRIMARY KEY, library TEXT, cycles TEXT, smiles TEXT);
        CREATE TABLE counts (member TEXT, sample TEXT, raw INTEGER NOT NULL,
          unique_umi INTEGER, corrected_umi INTEGER, PRIMARY KEY(member,sample));
        CREATE INDEX sample_counts ON counts(sample,member);
    """)
    options, total, members = request["payload"], 0, 0
    try:
        rows = original.execute("SELECT * FROM reads ORDER BY sample,library,member,umi")
        for key, group in itertools.groupby(
            rows, key=lambda row: (row["sample"], row["library"], row["member"])
        ):
            umis, cycles = {}, None
            for row in group:
                if len(umis) >= options["max_umis_per_member"]:
                    raise ValueError("A member exceeds the selected per-compound UMI work budget.")
                if cycles is not None and cycles != row["cycles"]:
                    raise ValueError("A decoded member has conflicting building-block identities.")
                cycles = row["cycles"]
                umis[row["umi"]] = row["count"]
            raw = raw_count(umis)
            if "" in umis and options["umi_method"] != "raw":
                raise ValueError(
                    "This selection lacks valid UMIs; choose explicit raw-read counts."
                )
            unique = dedup_count(umis) if "" not in umis else None
            corrected = (
                corrected_count(umis, method=options["umi_method"])
                if options["umi_method"] in {"directional", "cluster"}
                else None
            )
            if corrected is not None and not 0 < corrected <= unique <= raw:
                raise ValueError(
                    "Native UMI correction does not reconcile with the observed reads."
                )
            sample, library, member = key
            output.execute(
                "INSERT OR IGNORE INTO members VALUES (?,?,?,NULL)", (member, library, cycles)
            )
            output.execute(
                "INSERT INTO counts VALUES (?,?,?,?,?)", (member, sample, raw, unique, corrected)
            )
            total += raw
            members += 1
            if members % 5000 == 0:
                output.commit()
                progress("Counting compound-scoped UMIs", members)
        output.commit()
        if total != result["counts"]["decoded_reads"]:
            raise ValueError("Counted DEL reads differ from their exact decoded evidence.")
        write_csv(
            "/output/compound-counts.csv",
            ["member", "sample", "raw", "unique_umi", "corrected_umi"],
            output.execute("SELECT * FROM counts ORDER BY member,sample"),
        )
        sample_totals = {
            row[0]: {"raw": row[1], "unique_umi": row[2], "corrected_umi": row[3]}
            for row in output.execute(
                "SELECT sample,SUM(raw),SUM(unique_umi),SUM(corrected_umi) "
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
        },
        metadata={
            "sample_totals": sample_totals,
            "umi_method": options["umi_method"],
            "scope": "PCR/UMI evidence; not binding affinity",
        },
    )
