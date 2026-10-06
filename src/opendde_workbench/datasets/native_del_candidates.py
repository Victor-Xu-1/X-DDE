"""Resolve selected DEL members to real structures and export a source-linked follow-up set."""

import importlib.metadata
import json
from pathlib import Path

from del_chemistry import candidate_molecule
from del_definition import prepare_home
from library_records import unbound_conformer
from platformnative_io import finish, readonly_database, source_result, write_csv


def run(request):
    from rdkit import Chem

    root, _ = source_result(request)
    original = readonly_database(root / "analysis.sqlite")
    options = request["payload"]
    libraries = {}
    if len(request["sources"]) > 1:
        definition_root, _ = source_result(request, 1)
        libraries = prepare_home(json.loads((definition_root / "del-definition.json").read_text()))
    writer = Chem.SDWriter("/output/del-candidates.sdf")
    candidates, failures = [], []
    try:
        for identifier in options["selected_ids"]:
            row = original.execute("SELECT * FROM members WHERE id=?", (identifier,)).fetchone()
            if row is None:
                raise ValueError("A selected DEL member is absent from this exact analysis.")
            try:
                smiles = row["smiles"]
                if not smiles:
                    library = libraries.get(row["library"] or options["library"])
                    if library is None:
                        raise ValueError(
                            "chemical_identity_unresolved; supply_the_matching_library_definition"
                        )
                    smiles = library.enumerate_by_bb_ids(json.loads(row["cycles"])).smi
                policy = options.get("attachment_policy", "retain")
                molecule = candidate_molecule(smiles, policy)
                molecule = unbound_conformer(
                    molecule, request["options"]["seed"] + row["ordinal"] % 100000
                )
                molecule.SetProp("_Name", identifier)
                molecule.SetProp("DEL_ID", identifier)
                molecule.SetProp("XDDE_GEOMETRY", "unbound_conformer")
                molecule.SetProp("XDDE_SUPPLIED_SMILES", smiles)
                molecule.SetProp("XDDE_ATTACHMENT_POLICY", policy)
                writer.write(molecule)
                candidates.append(
                    {
                        "id": identifier,
                        "source_job": request["sources"][0]["job_id"],
                        "source_record": row["ordinal"],
                        "smiles": Chem.MolToSmiles(molecule, isomericSmiles=True),
                        "artifact": "del-candidates.sdf",
                        "record": len(candidates),
                        "geometry": "unbound_conformer",
                    }
                )
            except (ValueError, RuntimeError, KeyError) as exc:
                failures.append([identifier, str(exc)[:240]])
    finally:
        writer.close()
        original.close()
    write_csv("/output/unresolved-members.csv", ["member", "reason"], failures)
    write_csv(
        "/output/followup-members.csv",
        ["member", "smiles", "source_job", "source_record"],
        [[row["id"], row["smiles"], row["source_job"], row["source_record"]] for row in candidates],
    )
    artifacts = {
        "unresolved-members.csv": "unresolved_chemical_members",
        "followup-members.csv": "del_followup_candidates",
    }
    if candidates:
        artifacts["del-candidates.sdf"] = "del_unbound_candidates"
    else:
        Path("/output/del-candidates.sdf").unlink()
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "screening",
        artifacts,
        counts={
            "selected": len(options["selected_ids"]),
            "resolved": len(candidates),
            "failed": len(failures),
        },
        candidates=candidates,
        molecule_artifact="del-candidates.sdf" if candidates else None,
        metadata={
            "chemical_state": "derived_candidates; supplied chemistry retained in SD properties",
            "attachment_policy": options.get("attachment_policy", "retain"),
            "off_DNA_scope": (
                "terminal dummy atoms capped only by explicit choice; "
                "not a confirmed synthesized structure"
            ),
            "geometry": "unbound; not a receptor binding pose",
            "source": request["sources"][0],
        },
    )
