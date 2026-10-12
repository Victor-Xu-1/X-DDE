"""The single native RDKit descriptor and spreadsheet implementation."""

import csv
from pathlib import Path


def properties(request: dict, bindings: dict, output: Path) -> dict:
    from molecule_math import describe, read_molecules
    from rdkit import Chem

    rows = [describe(Chem.MolFromSmiles(s), s) for s in request["smiles"]]
    for identifier in request["ligand_files"]:
        selected = {
            ref["record"]: ref
            for ref in request.get("scientific_inputs", [])
            if ref["asset_id"] == identifier
        }
        found = set()
        for index, molecule in enumerate(read_molecules(Path(bindings[identifier]))):
            if selected and index not in selected:
                continue
            if len(rows) >= 500:
                raise ValueError(
                    "A property task supports at most500 molecules; split the input file."
                )
            row = describe(molecule, f"{identifier}:{index + 1}")
            if molecule is not None:
                names = [
                    molecule.GetProp(key).strip()
                    for key in ("Compound_ID", "_Name")
                    if molecule.HasProp(key)
                ]
                row["name"] = next((name for name in names if name), "")
            if selected:
                row["scientific_reference"] = selected[index]
                found.add(index)
            rows.append(row)
        if selected.keys() - found:
            raise ValueError("Selected scientific molecular record is missing from the file.")
    if not rows:
        raise ValueError("No molecule records were found.")
    fields = [
        "input",
        "name",
        "available",
        "reason",
        "smiles",
        "mw",
        "logp",
        "tpsa",
        "qed",
        "sa",
        "hbd",
        "hba",
        "rotatable_bonds",
    ]
    with (output / "properties.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        # CSV strings are made safe for spreadsheets without altering the JSON data.
        writer.writerows(
            {
                k: "'" + v if isinstance(v, str) and v.startswith(("=", "+", "-", "@")) else v
                for k in fields
                for v in [row.get(k)]
            }
            for row in rows
        )
    return {
        "operation": "properties",
        "complete": True,
        "molecules": rows,
        "source": "RDKit descriptors and SA score",
        "notes": "Computed descriptors; QED is drug-likeness, SA is a heuristic, not a route. "
        "No ADMET or measured potency.",
    }
