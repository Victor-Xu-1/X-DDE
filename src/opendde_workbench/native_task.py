"""Container entry point for native conversion/inspection and RDKit evaluation.

This module imports scientific libraries only inside the external runtime.
"""

import csv
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path("/job")
OUTPUT = ROOT / "output"


def properties(request: dict, bindings: dict) -> dict:
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
    with (OUTPUT / "properties.csv").open("w", newline="", encoding="utf-8-sig") as file:
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
        "molecules": rows,
        "source": "RDKit descriptors and SA score",
        "notes": "Computed descriptors; QED is drug-likeness, SA is a heuristic, not a route. "
        "No ADMET or measured potency.",
    }


def inspect() -> dict:
    from biotite.structure.io.pdbx import CIFFile, set_structure
    from opendde.data.inference.json_to_feature import SampleDictToFeatures

    document = json.loads((ROOT / "input.json").read_text())[0]
    atoms = SampleDictToFeatures(document).get_atom_array()
    if len(atoms) > 100000:
        raise ValueError("Input preview supports at most100000 atoms.")
    cif = CIFFile()
    set_structure(cif, atoms)
    cif.write(OUTPUT / "input-preview.cif")
    rows = [
        {
            "entity": int(atoms.label_entity_id[i]),
            "copy_index": int(atoms.copy_id[i]),
            "chain": str(atoms.chain_id[i]),
            "position": int(atoms.res_id[i]),
            "residue": str(atoms.res_name[i]),
            "atom": str(atoms.atom_name[i]),
            "element": str(atoms.element[i]),
        }
        for i in range(len(atoms))
    ]
    return {
        "atoms": rows,
        "structure": "input-preview.cif",
        "notes": "Input topology from the native parser; "
        "coordinates are not a predicted binding pose.",
    }


def conversion(request: dict, bindings: dict) -> dict:
    from runner.batch_inference import tojson

    outputs = []
    for identifier in request["assets"]:
        args = [
            "-i",
            bindings[identifier],
            "-o",
            str(OUTPUT / identifier),
            "--altloc",
            request["altloc"],
        ]
        if request["assembly_id"]:
            args += ["--assembly_id", request["assembly_id"]]
        if request["include_discont_poly_poly_bonds"]:
            args.append("--include_discont_poly_poly_bonds")
        outputs.extend(tojson.main(args=args, standalone_mode=False))
    return {"documents": [str(Path(p).relative_to(OUTPUT)) for p in outputs]}


def preparation(request: dict) -> dict:
    from runner.batch_inference import inputprep, msa, msatemplate

    command = {"msa": msa, "mt": msatemplate, "prep": inputprep}[request["operation"]]
    args = ["-i", str(ROOT / "input.json"), "-o", str(OUTPUT)]
    if request["operation"] == "prep":
        args += ["--nhmmer_n_cpu", str(request["parameters"]["search_cpus"])]
    generated = Path(command.main(args=args, standalone_mode=False)).resolve()
    if not generated.is_relative_to(ROOT) or not generated.is_file():
        raise ValueError("Native preprocessing did not return a managed inference document.")
    # msa writes beside its input; mt/prep may use a nested cache directory.
    shutil.copyfile(generated, OUTPUT / "prepared-input.json")
    return {"documents": ["prepared-input.json"]}


def resources(request: dict) -> dict:
    script = "/runtime/external/opendde/scripts/download_opendde_data.sh"
    for target in request["targets"]:
        args = ["bash", script, "--root", "/opendde"]
        if target in {"standard", "abag"}:
            args += [
                "--checkpoint",
                "opendde.pt" if target == "standard" else "opendde_abag.pt",
                "--skip-common",
                "--skip-search-database",
            ]
        elif target == "common":
            args += ["--skip-model", "--skip-search-database"]
        elif target == "search":
            if shutil.which("zstd") is None:
                raise ValueError(
                    "Install zstd in the compute image before downloading search databases."
                )
            if shutil.disk_usage("/opendde").free < 110 * 1024**3:
                raise ValueError(
                    "At least110GiB free space is required for the native search database bundle."
                )
            args += ["--skip-model", "--skip-common"]
        else:
            raise ValueError("Unknown managed resource.")
        subprocess.run(args, check=True, timeout=24 * 3600)
    return {
        "installed": request["targets"],
        "source": "OpenDDE manifest-backed native download helper",
    }


def main():
    request = json.loads((ROOT / "request.json").read_text())
    bindings = json.loads((ROOT / "bindings.json").read_text())
    OUTPUT.mkdir(exist_ok=True)
    handlers = {
        "properties": lambda: properties(request, bindings),
        "inspect": inspect,
        "json": lambda: conversion(request, bindings),
        "resources": lambda: resources(request),
        "msa": lambda: preparation(request),
        "mt": lambda: preparation(request),
        "prep": lambda: preparation(request),
    }
    result = handlers[request["operation"]]()
    result.update(operation=request["operation"], complete=True)
    temporary = OUTPUT / "result.tmp"
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(OUTPUT / "result.json")


if __name__ == "__main__":
    main()
