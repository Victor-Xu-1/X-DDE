"""Streaming enrichment, replicate evidence, matched controls and source-linked DEL hits."""

import importlib.metadata
import json
from pathlib import Path

import numpy as np
from del_count_table import prepare_counts
from del_statistics import enrichment, evidence, groups
from del_support import supporting_samples
from platformnative_io import finish, progress, write_csv


def run(request):
    options = request["payload"]
    database, totals, observed = prepare_counts(request)
    group_map, comparisons = groups(options, totals)
    required_support = options.get("minimum_supporting_samples", 1)
    database.executescript("""
        CREATE TABLE comparisons (id TEXT PRIMARY KEY, definition TEXT NOT NULL);
        CREATE TABLE enrichment (member TEXT, comparison TEXT,
          selection INTEGER, reference INTEGER, score REAL,
          lower REAL, upper REAL, replicate_cv REAL, flags TEXT, prioritizable INTEGER,
          supporting_samples INTEGER, target_samples INTEGER,
          PRIMARY KEY(member,comparison));
        CREATE INDEX enrichment_order ON enrichment(comparison,score DESC,member);
    """)
    for comparison in comparisons:
        database.execute(
            "INSERT INTO comparisons VALUES (?,?)", (comparison["id"], json.dumps(comparison))
        )
    depth = np.asarray(totals, dtype=float)
    sums = np.zeros(len(totals))
    cross = np.zeros((len(totals), len(totals)))
    completed = 0
    try:
        cursor = database.execute("SELECT * FROM members ORDER BY ordinal")
        while rows := cursor.fetchmany(2000):
            counts = np.array(
                [[row[f"c{index}"] for index in range(len(totals))] for row in rows], dtype=np.int64
            )
            normalized = np.divide(
                counts * 1000000.0, depth, where=depth > 0, out=np.zeros_like(counts, dtype=float)
            )
            logged = np.log1p(normalized)
            sums += logged.sum(axis=0)
            cross += logged.T @ logged
            for comparison in comparisons:
                supported = supporting_samples(counts, comparison, totals, options)
                selection = counts[:, comparison["selected_columns"]].sum(axis=1)
                reference = counts[:, comparison["reference_columns"]].sum(axis=1)
                score, lower, upper = enrichment(
                    selection,
                    reference,
                    comparison["selection_depth"],
                    comparison["reference_depth"],
                )
                output = []
                for index, row in enumerate(rows):
                    cv, flags = evidence(
                        int(selection[index]),
                        int(reference[index]),
                        normalized[index, comparison["selected_columns"]],
                        options,
                    )
                    if supported[index] < required_support:
                        flags.append("insufficient_sample_support")
                    if not np.isfinite(score[index]):
                        raise ValueError(
                            "The selected enrichment model returned a nonfinite ranking score."
                        )
                    priority = (
                        selection[index] >= options["minimum_counts"]
                        and score[index] >= options["minimum_enrichment"]
                        and supported[index] >= required_support
                    )
                    output.append(
                        (
                            row["id"],
                            comparison["id"],
                            int(selection[index]),
                            int(reference[index]),
                            float(score[index]),
                            float(lower[index]) if np.isfinite(lower[index]) else None,
                            float(upper[index]) if np.isfinite(upper[index]) else None,
                            cv,
                            json.dumps(flags),
                            int(priority),
                            int(supported[index]),
                            len(comparison["selected_columns"]),
                        )
                    )
                database.executemany(
                    "INSERT INTO enrichment VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", output
                )
            completed += len(rows)
            database.commit()
            progress("Comparing DEL enrichment and reference evidence", completed, observed)
        covariance = cross - np.outer(sums, sums) / observed
        variances = np.maximum(np.diag(covariance), 0)
        divisor = np.sqrt(np.outer(variances, variances))
        correlation = np.divide(
            covariance, divisor, where=divisor > 1e-12, out=np.zeros_like(covariance)
        )
        correlation = np.clip(correlation, -1, 1)
        qc = {
            "samples": [
                {**sample, "depth": totals[index]}
                for index, sample in enumerate(options["samples"])
            ],
            "correlation_logcpm_pearson": correlation.tolist(),
            "correlation_available": (divisor > 1e-12).tolist(),
            "observed_members": observed,
            "theoretical_library_size": options["library_size"],
            "observed_union_scope": "unobserved theoretical members are not fabricated",
        }
        Path("/output/count-quality.json").write_text(json.dumps(qc))
        write_csv(
            "/output/enrichment.csv",
            [
                "member",
                "comparison",
                "selection",
                "reference",
                "MLE_enrichment",
                "count_posterior_low",
                "count_posterior_high",
                "replicate_CV",
                "evidence_flags",
                "prioritizable",
                "supporting_samples",
                "target_samples",
            ],
            database.execute("SELECT * FROM enrichment ORDER BY comparison,score DESC,member"),
        )
        selected = options["chosen_comparison"] or (comparisons[0]["id"] if comparisons else "")
        if selected and selected not in {item["id"] for item in comparisons}:
            raise ValueError("The displayed comparison is absent from the confirmed study design.")
        candidates = []
        if selected:
            candidate_filter = " AND e.prioritizable=1" if required_support > 1 else ""
            for row in database.execute(
                "SELECT m.*,e.score FROM enrichment e JOIN members m ON m.id=e.member "
                "WHERE e.comparison=?" + candidate_filter + " ORDER BY e.score DESC,m.id LIMIT ?",
                (selected, options["retain"]),
            ):
                candidates.append(
                    {
                        "id": row["id"],
                        "source_job": request["sources"][0]["job_id"]
                        if request["sources"]
                        else None,
                        "source_asset": str(request["inputs"][0]["source"]["asset_id"])
                        if request["inputs"]
                        else None,
                        "source_record": row["ordinal"],
                        "smiles": row["smiles"],
                        "score": row["score"],
                        "geometry": "none",
                    }
                )
        prioritized = database.execute(
            "SELECT COUNT(*) FROM enrichment WHERE prioritizable=1"
        ).fetchone()[0]
        database.commit()
    finally:
        database.close()
    warnings = []
    if not comparisons:
        warnings.append(
            "No confirmed reference comparison; descriptive counts and sequencing depths only."
        )
    if options["count_unit"] == "reads":
        warnings.append("Raw-read analysis does not remove PCR amplification bias.")
    if options["count_unit"] == "reported_counts":
        warnings.append(
            "Externally reported counts retain the source processing; UMI accuracy is not "
            "independently verified. Intervals use a working count model, not validated "
            "measurement uncertainty."
        )
    if required_support > 1:
        warnings.append("Target-sample consistency does not establish biological reproducibility.")
    method = {
        "enrichment": "DELi MLE ratio; pooled matched reference; global sequencing depths",
        "reference": "10.1021/acsomega.3c02152",
        "pseudocount": 3 / 8,
        "interval": "95% independent Poisson-Gamma count posterior; Gamma shape=count+3/8",
        "interval_scope": (
            "working_count_model; external_processing_unverified; not biological reproducibility"
            if options["count_unit"] == "reported_counts"
            else "sequencing_count_uncertainty; not biological reproducibility"
        ),
        "minimum_supporting_samples": required_support,
        "sample_support_definition": "positive count and per-sample depth-normalized ratio "
        "at least the selected enrichment threshold; not an independent biological replicate claim",
        "fdr": "not_calculated",
        "count_unit": options["count_unit"],
        "comparisons": comparisons,
        "samples": options["samples"],
        "chosen_comparison": selected,
    }
    Path("/output/analysis-method.json").write_text(json.dumps(method))
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "analysis",
        {
            "analysis.sqlite": "del_comparison_evidence",
            "enrichment.csv": "del_member_enrichment",
            "analysis-method.json": "del_analysis_method",
            "count-quality.json": "count_quality",
        },
        counts={
            "observed_members": observed,
            "samples": len(totals),
            "comparisons": len(comparisons),
            "prioritized_comparisons": prioritized,
        },
        candidates=candidates,
        metadata={
            "comparisons": [
                {"id": item["id"], "selection": item["selection"], "reference": item["reference"]}
                for item in comparisons
            ],
            "chosen_comparison": selected,
            "count_unit": options["count_unit"],
            "minimum_counts": options["minimum_counts"],
            "minimum_enrichment": options["minimum_enrichment"],
            "minimum_supporting_samples": required_support,
            "candidate_scope": "prioritizable_members" if required_support > 1 else "top_scores",
            "scope": "enrichment evidence; not KD, IC50 or proven binding",
        },
        warnings=warnings,
    )
