"""Curate only the actually retrieved shortlist with the existing RDKit selection authority."""

import json
from types import SimpleNamespace

from platformnative_io import readonly_database, write_csv
from screen_inspection import AlertInspector, scaffold_identity
from screen_record import evaluate_record
from screen_selection import annotate_unselected, select_indices


def selection(members, options, seed):
    from rdkit import Chem
    from rdkit.Chem import rdFingerprintGenerator

    policy = options.get("candidate_policy", "all")
    alerts = options.get("structural_alerts", "off")
    method = options.get("shortlist", "ranked")
    inspector = AlertInspector("pains_brenk") if alerts != "off" else None
    generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, includeChirality=True)
    evaluation = SimpleNamespace(
        mode="filter" if policy == "lead_like" else "inventory",
        deduplicate=True,
        minimum_mw=150,
        maximum_mw=500,
        minimum_logp=-1,
        maximum_logp=5,
        alert_policy=alerts,
    )
    rows, fingerprints, groups, seen = [], [], {}, {}
    for record, (_, _, _, row) in enumerate(members):
        molecule = Chem.MolFromSmiles(row["smiles"])
        item, fingerprint = evaluate_record(
            record, molecule, evaluation, generator, None, None, inspector, seen, groups
        )
        if method == "scaffold" and item["eligible"]:
            identity = scaffold_identity(molecule)
            if identity is None:
                item.update(eligible=False, reason_code="multiple_fragments")
            else:
                groups.setdefault(identity, len(groups))
                item["scaffold_group"] = groups[identity]
        rows.append(item)
        fingerprints.append(fingerprint)
    choice = SimpleNamespace(
        mode="inventory" if method == "ranked" else method,
        max_selected=options["retain"],
        per_scaffold=1,
        seed=seed,
    )
    selected = select_indices(rows, fingerprints, choice)
    for index in selected:
        rows[index]["selected"] = True
    annotate_unselected(rows, selected, choice)
    return set(selected), rows


def retain_candidates(request, indexes, ranked):
    from rdkit import Chem

    databases = [readonly_database(item[0] / "index-members.sqlite") for item in indexes]
    members, seen = [], set()
    try:
        for score, raw, index, ordinal in ranked:
            row = (
                databases[index]
                .execute("SELECT * FROM members WHERE ordinal=?", (ordinal,))
                .fetchone()
            )
            if row is None:
                raise ValueError("A ranked embedding has no confirmed chemical identity.")
            if row["id"] not in seen:
                members.append((score, raw, index, dict(row)))
                seen.add(row["id"])
                if len(members) == request["payload"]["top_k"]:
                    break
    finally:
        for database in databases:
            database.close()
    selected, evidence = selection(members, request["payload"], request["options"]["seed"])
    candidates, failures, ranking, written = [], [], [], 0
    writer = Chem.SDWriter("/output/candidates.sdf")
    try:
        for position, (score, raw, _, row) in enumerate(members):
            item = evidence[position]
            candidate = {
                "id": row["id"],
                "display_name": row["display_name"],
                "source_job": row["source_job"],
                "source_record": row["source_record"],
                "supplier": row["supplier"],
                "smiles": row["smiles"],
                "score": score,
                "raw_score": raw,
                "geometry": "none",
            }
            if position in selected:
                molecule = Chem.MolFromMolBlock(row["molblock"], removeHs=False)
                if (
                    molecule is None
                    or not molecule.GetNumConformers()
                    or not molecule.GetConformer().Is3D()
                ):
                    failures.append([row["id"], "indexed_conformer_unavailable"])
                else:
                    molecule.SetProp("_Name", row["id"])
                    molecule.SetProp("XDDE_COMPOUND_ID", row["id"])
                    molecule.SetProp("XDDE_GEOMETRY", "unbound_conformer")
                    molecule.SetDoubleProp("DRUGCLIP_SCORE", score)
                    writer.write(molecule)
                    candidate.update(
                        artifact="candidates.sdf", record=written, geometry="unbound_conformer"
                    )
                    written += 1
            candidates.append(candidate)
            values = item["descriptors"] or {}
            ranking.append(
                [
                    position + 1,
                    row["id"],
                    row["display_name"],
                    score,
                    raw,
                    row["smiles"],
                    row["supplier"],
                    row["source_job"],
                    row["source_record"],
                    position in selected,
                    item["reason_code"] or "selected",
                    values.get("mw"),
                    values.get("logp"),
                    values.get("qed"),
                    json.dumps(item["structural_alerts"] or []),
                ]
            )
    finally:
        writer.close()
    write_csv(
        "/output/ranked-candidates.csv",
        [
            "rank",
            "compound",
            "supplier_id",
            "retrieval_score",
            "mean_cosine",
            "smiles",
            "supplier",
            "source_job",
            "source_record",
            "shortlisted",
            "selection_reason",
            "MW",
            "LogP",
            "QED",
            "structural_alerts",
        ],
        ranking,
    )
    write_csv("/output/candidate-failures.csv", ["compound", "reason"], failures)
    return candidates, failures
