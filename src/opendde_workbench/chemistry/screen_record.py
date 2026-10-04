"""Evaluate one original record without rewriting its chemistry or coordinates."""

from screen_inspection import scaffold_identity
from screen_io import valid_molecule


def descriptors(molecule):
    from rdkit import Chem
    from rdkit.Chem import QED, Crippen, Descriptors, Lipinski, rdMolDescriptors

    return {
        "smiles": Chem.MolToSmiles(molecule, isomericSmiles=True),
        "mw": Descriptors.MolWt(molecule),
        "logp": Crippen.MolLogP(molecule),
        "tpsa": rdMolDescriptors.CalcTPSA(molecule),
        "qed": QED.qed(molecule),
        "hbd": Lipinski.NumHDonors(molecule),
        "hba": Lipinski.NumHAcceptors(molecule),
        "rotatable_bonds": Lipinski.NumRotatableBonds(molecule),
        "fragments": len(Chem.GetMolFrags(molecule)),
    }


def evaluate_record(record, molecule, options, generator, query, query_fp, inspector, seen, groups):
    from rdkit import DataStructs

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
        "structural_alerts": None,
        "scaffold_group": None,
    }
    try:
        comparison = valid_molecule(molecule)
    except ValueError as exc:
        row.update(reason_code="invalid_record", reason=str(exc)[:500])
        return row, None
    # Parser failures are per-record. Missing rules or scientific implementation
    # errors fail the job; they must not masquerade as an invalid input record.
    values = descriptors(comparison)
    row.update(available=True, eligible=True, descriptors=values)
    fingerprint = generator.GetFingerprint(comparison)
    if inspector is not None:
        row["structural_alerts"] = inspector.inspect(comparison)
    if options.mode == "scaffold":
        identity = scaffold_identity(comparison)
        if identity is not None:
            if identity not in groups:
                groups[identity] = {
                    "index": len(groups),
                    "kind": identity[0],
                    "smiles": identity[1],
                    "records": [],
                }
            group = groups[identity]
            group["records"].append(record)
            row["scaffold_group"] = group["index"]
    if options.deduplicate and values["smiles"] in seen:
        row.update(
            eligible=False,
            reason_code="duplicate",
            duplicate_of=seen[values["smiles"]],
            reason=f"Chemical duplicate of record {seen[values['smiles']] + 1}.",
        )
    else:
        seen[values["smiles"]] = record
    if options.mode == "similarity":
        row["similarity"] = DataStructs.TanimotoSimilarity(fingerprint, query_fp)
        if row["eligible"] and row["similarity"] < options.minimum_similarity:
            row.update(
                eligible=False,
                reason_code="similarity_threshold",
                reason="Below the selected fingerprint similarity threshold.",
            )
    elif options.mode == "substructure":
        row["substructure_match"] = comparison.HasSubstructMatch(query, useChirality=True)
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
            options.minimum_mw <= values["mw"] <= options.maximum_mw
            and options.minimum_logp <= values["logp"] <= options.maximum_logp
        )
    ):
        row.update(
            eligible=False,
            reason_code="descriptor_range",
            reason="Outside the selected descriptor range.",
        )
    if options.mode == "scaffold" and row["eligible"] and row["scaffold_group"] is None:
        row.update(
            eligible=False,
            reason_code="multiple_fragments",
            reason="Scaffold selection needs one fragment; the original record is preserved.",
        )
    if options.alert_policy == "exclude" and row["eligible"] and row["structural_alerts"]:
        row.update(
            eligible=False,
            reason_code="structural_alert",
            reason="Rule match excluded by the requested policy; this is not an activity result.",
        )
    return row, fingerprint
