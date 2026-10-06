"""Observed mono-/disynthon counts are aggregated before enrichment, preserving coverage."""

import importlib.metadata
import json
import sqlite3
from pathlib import Path

from del_statistics import enrichment
from platformnative_io import finish, progress, readonly_database, source_result, write_csv


def run(request):
    root, _ = source_result(request)
    original = readonly_database(root / "analysis.sqlite")
    options = request["payload"]
    definition = original.execute(
        "SELECT definition FROM comparisons WHERE id=?", (options["chosen_comparison"],)
    ).fetchone()
    if definition is None:
        raise ValueError("Choose a comparison actually computed in the selected analysis.")
    comparison = json.loads(definition[0])
    first, second = options["series_cycles"]
    output = sqlite3.connect("/output/series.sqlite")
    output.row_factory = sqlite3.Row
    output.executescript("""
        CREATE TABLE series (kind TEXT,cycle_a INTEGER,cycle_b INTEGER,block_a TEXT,block_b TEXT,
          members INTEGER,selection INTEGER,reference INTEGER,score REAL,lower REAL,upper REAL,
          PRIMARY KEY(kind,cycle_a,cycle_b,block_a,block_b));
        CREATE INDEX series_order ON series(kind,score DESC);
    """)
    seen = 0
    try:
        rows = original.execute(
            "SELECT m.cycles,e.selection,e.reference FROM members m "
            "JOIN enrichment e ON e.member=m.id "
            "WHERE e.comparison=?",
            (options["chosen_comparison"],),
        )
        for row in rows:
            blocks = json.loads(row["cycles"])
            if max(first, second) >= len(blocks):
                raise ValueError(
                    "Series analysis needs explicit observed building-block cycle identities."
                )
            entries = [
                ("mono", first, -1, blocks[first], ""),
                ("mono", second, -1, blocks[second], ""),
                ("di", first, second, blocks[first], blocks[second]),
            ]
            for entry in entries:
                output.execute(
                    "INSERT INTO series VALUES (?,?,?,?,?,1,?,?,NULL,NULL,NULL) "
                    "ON CONFLICT(kind,cycle_a,cycle_b,block_a,block_b) DO UPDATE SET "
                    "members=members+1,selection=selection+excluded.selection,reference=reference+excluded.reference",
                    (*entry, row["selection"], row["reference"]),
                )
            seen += 1
            if seen % 5000 == 0:
                output.commit()
                progress("Aggregating observed DEL series", seen)
        output.commit()
        for row in output.execute("SELECT rowid,* FROM series"):
            score, lower, upper = enrichment(
                [row["selection"]],
                [row["reference"]],
                comparison["selection_depth"],
                comparison["reference_depth"],
            )
            output.execute(
                "UPDATE series SET score=?,lower=?,upper=? WHERE rowid=?",
                (float(score[0]), float(lower[0]), float(upper[0]), row["rowid"]),
            )
        output.commit()
        write_csv(
            "/output/mono-disynthon.csv",
            [
                "kind",
                "cycle_a",
                "cycle_b",
                "block_a",
                "block_b",
                "observed_members",
                "selection",
                "reference",
                "MLE_enrichment",
                "count_posterior_low",
                "count_posterior_high",
            ],
            output.execute("SELECT * FROM series ORDER BY kind,score DESC"),
        )
        top = [
            dict(row)
            for row in output.execute(
                "SELECT * FROM series ORDER BY score DESC LIMIT ?", (options["maximum_series"],)
            )
        ]
        number = output.execute("SELECT COUNT(*) FROM series").fetchone()[0]
    finally:
        original.close()
        output.close()
    Path("/output/series-view.json").write_text(
        json.dumps(
            {
                "comparison": comparison,
                "cycles": [first, second],
                "series": top,
                "total_series": number,
                "shown": len(top),
                "scope": "observed_union; aggregated counts, not mean molecular enrichment",
                "missing_pairs": "unobserved",
            },
            allow_nan=False,
        )
    )
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "analysis",
        {
            "series.sqlite": "del_series_counts",
            "mono-disynthon.csv": "del_series_enrichment",
            "series-view.json": "del_series_visualization",
        },
        counts={"observed_members": seen, "series": number, "shown_series": len(top)},
        metadata={
            "comparison": options["chosen_comparison"],
            "cycles": [first, second],
            "scope": "observed building-block evidence; not measured pairwise binding energy",
        },
    )
