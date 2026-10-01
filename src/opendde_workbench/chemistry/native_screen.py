"""Actual offline RDKit inventory, filtering, fingerprints, substructure and diversity selection."""

import hashlib

from screen_io import read_sdf, valid_molecule
from screen_options import ScreenOptions


def evaluate(mol):
    from rdkit import Chem
    from rdkit.Chem import QED, Crippen, Descriptors, Lipinski, rdMolDescriptors

    return {
        "smiles": Chem.MolToSmiles(mol, isomericSmiles=True),
        "mw": Descriptors.MolWt(mol),
        "logp": Crippen.MolLogP(mol),
        "tpsa": rdMolDescriptors.CalcTPSA(mol),
        "qed": QED.qed(mol),
        "hbd": Lipinski.NumHDonors(mol),
        "hba": Lipinski.NumHAcceptors(mol),
        "rotatable_bonds": Lipinski.NumRotatableBonds(mol),
        "fragments": len(Chem.GetMolFrags(mol)),
    }


def select_indices(rows, fingerprints, options):
    eligible = [row for row in rows if row["eligible"]]
    if options.mode == "similarity":
        eligible.sort(key=lambda row: (-row["similarity"], row["record"]))
    if options.mode == "diversity" and eligible:
        from rdkit.SimDivFilters.rdSimDivPickers import MaxMinPicker

        chosen = MaxMinPicker().LazyBitVectorPick(
            [fingerprints[row["record"]] for row in eligible],
            len(eligible),
            min(options.max_selected, len(eligible)),
            seed=options.seed,
        )
        return [eligible[i]["record"] for i in chosen]
    return [row["record"] for row in eligible[: options.max_selected]]


def run_screen(request, bindings, directory, output):
    from rdkit import Chem, DataStructs, rdBase
    from rdkit.Chem import rdFingerprintGenerator

    options = ScreenOptions.model_validate(request["options"])
    supplier = read_sdf(request["library"], bindings, directory)
    generator = rdFingerprintGenerator.GetMorganGenerator(
        radius=2, fpSize=2048, includeChirality=True
    )
    query, query_fp = None, None
    if options.mode in {"similarity", "substructure"}:
        reference = request.get("query")
        if not reference:
            raise ValueError("This search requires one exact query molecular record.")
        query_records = read_sdf(reference, bindings, directory)
        record = reference["record"]
        if (
            isinstance(record, bool)
            or not isinstance(record, int)
            or not 0 <= record < len(query_records)
        ):
            raise ValueError("Query record is missing.")
        query = valid_molecule(query_records[record])
        query_fp = generator.GetFingerprint(query)
    rows, fingerprints, seen = [], {}, {}
    for record, molecule in enumerate(supplier):
        row = {
            "record": record,
            "available": False,
            "eligible": False,
            "selected": False,
            "output_record": None,
            "similarity": None,
            "substructure_match": None,
            "reason": None,
            "reason_code": None,
            "duplicate_of": None,
            "descriptors": None,
        }
        try:
            mol = valid_molecule(molecule)
            properties = evaluate(mol)
            row.update(available=True, descriptors=properties, eligible=True)
            fp = generator.GetFingerprint(mol)
            fingerprints[record] = fp
            if options.deduplicate and properties["smiles"] in seen:
                row.update(
                    eligible=False,
                    reason_code="duplicate",
                    duplicate_of=seen[properties["smiles"]],
                    reason=f"Chemical duplicate of record {seen[properties['smiles']] + 1}.",
                )
            else:
                seen[properties["smiles"]] = record
            if options.mode == "similarity":
                row["similarity"] = DataStructs.TanimotoSimilarity(fp, query_fp)
                if row["eligible"] and row["similarity"] < options.minimum_similarity:
                    row.update(
                        eligible=False,
                        reason_code="similarity_threshold",
                        reason="Below the selected fingerprint similarity threshold.",
                    )
            elif options.mode == "substructure":
                row["substructure_match"] = mol.HasSubstructMatch(query, useChirality=True)
                if row["eligible"] and not row["substructure_match"]:
                    row.update(
                        eligible=False,
                        reason_code="substructure_mismatch",
                        reason="Does not contain the selected query chemical substructure.",
                    )
            elif (
                options.mode == "filter"
                and row["eligible"]
                and not (
                    options.minimum_mw <= properties["mw"] <= options.maximum_mw
                    and options.minimum_logp <= properties["logp"] <= options.maximum_logp
                )
            ):
                row.update(
                    eligible=False,
                    reason_code="descriptor_range",
                    reason="Outside the selected descriptor range.",
                )
        except ValueError as exc:
            row.update(
                available=False,
                eligible=False,
                descriptors=None,
                similarity=None,
                substructure_match=None,
                reason_code="invalid_record",
                duplicate_of=None,
                reason=str(exc)[:500],
            )
            fingerprints.pop(record, None)
        rows.append(row)
    selected = select_indices(rows, fingerprints, options)
    artifact = "selected.sdf"
    with Chem.SDWriter(str(output / artifact)) as writer:
        for output_record, record in enumerate(selected):
            writer.write(supplier[record])
            rows[record].update(selected=True, output_record=output_record)
    for row in rows:
        if row["eligible"] and not row["selected"]:
            row["reason_code"] = "count_budget"
            row["reason"] = "Eligible but outside the selected output count budget."
    digest = hashlib.sha256((output / artifact).read_bytes()).hexdigest()
    return {
        "operation": "library_screen",
        "complete": True,
        "schema_version": 1,
        "library": request["library"],
        "query": request.get("query"),
        "options": options.model_dump(mode="json"),
        "rows": rows,
        "selected_records": selected,
        "artifact": artifact,
        "sha256": digest,
        "versions": {"rdkit": rdBase.rdkitVersion},
        "fingerprint": {"method": "Morgan", "radius": 2, "bits": 2048, "chirality": True},
        "scope": "chemical_library_selection_not_activity_admet_or_binding_prediction",
        "chemical_processing": "original_records_no_salt_stripping_or_state_enumeration",
        "coordinate_frame": "retained_input_coordinates_not_inferred_binding_pose",
    }
