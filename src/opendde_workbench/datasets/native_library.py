"""RDKit large-library import and exact candidate extraction, with full row accounting."""

import hashlib
from pathlib import Path

from library_database import create
from library_records import chemistry, records, unbound_conformer
from platformnative_io import (
    finish,
    input_file,
    progress,
    readonly_database,
    source_result,
    write_csv,
)


def run(request):
    if request["payload"]["mode"] == "subset":
        subset(request)
    else:
        prepare(request)


def prepare(request):
    from rdkit import Chem, rdBase

    options = request["payload"]
    file, _ = input_file(request, "data")
    database = create(Path("/output/library.sqlite"))
    total = valid = 0
    try:
        for record, (identifier, smiles, molecule) in enumerate(records(file, options)):
            if record >= options["max_records"]:
                raise ValueError("The source exceeds the selected compound-record budget.")
            total += 1
            error = compound_id = None
            identifier = identifier.strip()
            try:
                if len(identifier) > 200 or any(ord(char) < 32 for char in identifier):
                    raise ValueError("invalid_supplier_identifier")
                if molecule is None:
                    molecule = Chem.MolFromSmiles(smiles.strip())
                if molecule is None or not molecule.GetNumAtoms():
                    raise ValueError("invalid_chemical_structure")
                if molecule.GetNumHeavyAtoms() > options["max_heavy_atoms"]:
                    raise ValueError("heavy_atom_budget_exceeded")
                canonical, properties = chemistry(molecule)
                compound_id = "cmp-" + hashlib.sha256(canonical.encode()).hexdigest()
                database.execute(
                    "INSERT OR IGNORE INTO compounds VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        compound_id,
                        canonical,
                        Chem.MolToMolBlock(molecule),
                        *properties.values(),
                        molecule.GetNumHeavyAtoms(),
                        int(bool(molecule.GetNumConformers() and molecule.GetConformer().Is3D())),
                        record,
                        options["supplier"],
                    ),
                )
                valid += 1
            except (ValueError, RuntimeError) as exc:
                compound_id = None
                error = str(exc)[:240]
            database.execute(
                "INSERT INTO records VALUES (?,?,?,?,?)",
                (record, options["supplier"], identifier, compound_id, error),
            )
            if total % 1000 == 0:
                database.commit()
                progress("Preparing compounds", total)
        if not valid:
            raise ValueError("This file contains no supported valid chemical members.")
        database.commit()
        unique = database.execute("SELECT COUNT(*) FROM compounds").fetchone()[0]
        write_csv(
            "/output/rejected-records.csv",
            ["record", "supplier_id", "reason"],
            database.execute(
                "SELECT record,supplier_id,error FROM records WHERE error IS NOT NULL"
            ),
        )
    finally:
        database.close()
    finish(
        request,
        rdBase.rdkitVersion,
        "library",
        {
            "library.sqlite": "compound_library",
            "rejected-records.csv": "rejected_records",
        },
        counts={
            "source_records": total,
            "valid_records": valid,
            "rejected_records": total - valid,
            "unique_compounds": unique,
            "duplicate_chemical_records": valid - unique,
        },
        metadata={
            "name": options["library_name"],
            "supplier": options["supplier"],
            "source_permission": options["source_permission"],
            "source_url": options["source_url"],
            "chemical_identity": "canonical_isomeric_smiles_without_standardization",
            "conformer_policy": "preserve_original; generate_only_when_selected",
        },
    )


def subset(request):
    from rdkit import Chem, rdBase

    root, _ = source_result(request)
    database = readonly_database(root / "library.sqlite")
    options = request["payload"]
    candidates, rejected = [], []
    writer = Chem.SDWriter("/output/candidates.sdf")
    try:
        for identifier in options["selected_ids"]:
            row = database.execute(
                "SELECT * FROM compounds WHERE id=?",
                (identifier,),
            ).fetchone()
            if row is None:
                raise ValueError("Selected compound does not belong to this exact library.")
            try:
                molecule = Chem.MolFromMolBlock(row["molblock"], removeHs=False)
                if molecule is None:
                    raise ValueError("stored_chemical_structure_invalid")
                is_3d = bool(row["is_3d"])
                if options["generate_conformers"] and not is_3d:
                    molecule = unbound_conformer(molecule, 2026 + row["source_record"] % 100000)
                    is_3d = True
                molecule.SetProp("_Name", identifier)
                molecule.SetProp("XDDE_COMPOUND_ID", identifier)
                molecule.SetProp("XDDE_SOURCE_JOB", request["sources"][0]["job_id"])
                molecule.SetProp("XDDE_GEOMETRY", "unbound_conformer" if is_3d else "none")
                writer.write(molecule)
                candidates.append(
                    {
                        "id": identifier,
                        "display_name": database.execute(
                            "SELECT supplier_id FROM records WHERE record=?",
                            (row["source_record"],),
                        ).fetchone()[0],
                        "smiles": row["smiles"],
                        "source_job": request["sources"][0]["job_id"],
                        "source_record": row["source_record"],
                        "supplier": row["supplier"],
                        "artifact": "candidates.sdf",
                        "record": len(candidates),
                        "geometry": "unbound_conformer" if is_3d else "none",
                    }
                )
            except (ValueError, RuntimeError) as exc:
                rejected.append([identifier, str(exc)[:240]])
    finally:
        writer.close()
        database.close()
    if not candidates:
        raise ValueError("None of the selected members produced a supported molecular file.")
    write_csv("/output/rejected-candidates.csv", ["compound", "reason"], rejected)
    finish(
        request,
        rdBase.rdkitVersion,
        "screening",
        {
            "candidates.sdf": "unbound_candidates",
            "rejected-candidates.csv": "rejected_records",
        },
        counts={
            "selected": len(options["selected_ids"]),
            "retained": len(candidates),
            "failed": len(rejected),
        },
        candidates=candidates,
        molecule_artifact="candidates.sdf",
        metadata={"geometry": "unbound; not a receptor binding pose"},
    )
