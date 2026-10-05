"""Small native input/output helpers; programs retain their own scientific algorithms."""

import csv
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path


def digest(file):
    with Path(file).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def input_file(request, role):
    selected = next((item for item in request["inputs"] if item["role"] == role), None)
    if selected is None:
        raise ValueError("Missing native input role: " + role)
    reference = selected["source"]
    bindings = json.loads(Path("/input/bindings.json").read_text())
    bound = bindings[reference["asset_id"]]
    if not bound.startswith("/job/assets/"):
        raise ValueError("Native input does not belong to the task snapshot.")
    file = Path("/input/assets") / Path(bound).name
    if (
        file.is_symlink()
        or not file.is_file()
        or file.stat().st_size > 25 * 1024**2
        or digest(file) != reference["sha256"]
    ):
        raise ValueError("Native scientific input is unsafe or its bytes changed.")
    return file, reference


def source_molecule(request):
    from rdkit import Chem

    file, reference = input_file(request, "ligand")
    if file.suffix == ".mol":
        if reference["record"]:
            raise ValueError("MOL input has exactly one chemical record.")
        molecule = Chem.MolFromMolFile(str(file), removeHs=False)
    else:
        records = Chem.SDMolSupplier(str(file), removeHs=False)
        record = reference["record"]
        if not 0 <= record < len(records):
            raise ValueError("The selected original molecular record is missing.")
        molecule = records[record]
    if molecule is None:
        raise ValueError("The selected molecular record cannot be parsed.")
    return molecule


def execute(arguments, *, cwd=None):
    subprocess.run([str(value) for value in arguments], cwd=cwd, check=True)


def copy_artifact(source, name):
    if Path(name).name != name or Path(source).is_symlink():
        raise ValueError("Native scientific output must be a direct regular file.")
    target = Path("/output") / name
    shutil.copyfile(source, target)
    return name


def metric(name, value, unit, method, meaning="score"):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Native scientific metric is not finite: " + name)
    return {"name": name, "value": number, "unit": unit, "method": method, "meaning": meaning}


def csv_file(name, header, rows):
    def safe(value):
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            return value
        text = str(value)
        return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text

    with Path("/output", name).open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(header)
        writer.writerows([[safe(value) for value in row] for row in rows])
    return name


def molecular_candidate(smiles, index, seed, metrics=()):
    from rdkit import Chem
    from rdkit.Chem import AllChem

    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None or len(Chem.GetMolFrags(molecule)) != 1:
        raise ValueError("Native generator returned an invalid or disconnected chemical graph.")
    conformer = Chem.AddHs(molecule)
    parameters = AllChem.ETKDGv3()
    parameters.randomSeed = seed
    geometry = "none"
    if AllChem.EmbedMolecule(conformer, parameters) == 0:
        if AllChem.MMFFHasAllMoleculeParams(conformer):
            AllChem.MMFFOptimizeMolecule(conformer, maxIters=500)
        molecule = Chem.RemoveHs(conformer)
        geometry = "unbound_conformer"
    else:
        AllChem.Compute2DCoords(molecule)
    name = f"molecule-{index:03d}.sdf"
    with Chem.SDWriter(str(Path("/output", name))) as writer:
        writer.write(molecule)
    return {
        "id": f"molecule-{index:03d}",
        "artifact": name,
        "smiles": Chem.MolToSmiles(molecule, isomericSmiles=True),
        "metrics": list(metrics),
        "geometry": geometry,
    }


def finish(request, version, candidates=(), metrics=(), **fields):
    output = Path("/output")
    files = {
        file.name: digest(file)
        for file in output.iterdir()
        if file.is_file()
        and not file.is_symlink()
        and file.name not in {"result.json", "result.json.tmp"}
    }
    value = {
        "operation": request["operation"],
        "schema_version": 1,
        "complete": True,
        "request_sha256": hashlib.sha256(Path("/input/request.json").read_bytes()).hexdigest(),
        "program": request["payload"]["kind"],
        "version": version,
        "candidates": list(candidates),
        "metrics": list(metrics),
        "artifact_sha256": files,
        "scope": "native_computation_not_experimental_measurement",
        **fields,
    }
    temporary = output / "result.json.tmp"
    temporary.write_text(json.dumps(value, allow_nan=False), encoding="utf-8")
    temporary.replace(output / "result.json")
