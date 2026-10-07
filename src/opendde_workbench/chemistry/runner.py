"""Offline native chemistry entry point, supervised by the sole platform Worker."""

import hashlib
import json
from importlib.metadata import version
from pathlib import Path

from conformers import prepare_conformers
from mapping import source_molecule
from options import StateOptions
from states import enumerate_states


def run(request, bindings, directory, output):
    from rdkit import Chem, rdBase
    from rdkit.Chem import rdDepictor

    options = StateOptions.model_validate(request["options"])
    ref = request["molecule"]
    bound = bindings[str(ref["asset_id"])]
    if not bound.startswith("/job/assets/"):
        raise ValueError("State input binding escapes the task snapshot.")
    root = directory / "assets"
    file = directory / bound.removeprefix("/job/")
    if (
        file.is_symlink()
        or not file.resolve().is_relative_to(root.resolve())
        or file.suffix != ".sdf"
        or file.stat().st_size > 25 * 1024**2
    ):
        raise ValueError("Choose a bounded SDF input inside the managed snapshot.")
    if (
        hashlib.sha256(file.read_bytes()).hexdigest() != ref["sha256"]
        or ref.get("conformer", 0) != 0
    ):
        raise ValueError("State input digest or conformer changed.")
    from sdf_io import read_records

    supplier = read_records(file.read_bytes())
    record = ref.get("record", 0)
    if (
        not isinstance(record, int)
        or isinstance(record, bool)
        or not 0 <= record < len(supplier)
        or supplier[record] is None
    ):
        raise ValueError("Selected molecular record is missing or invalid.")
    source = source_molecule(supplier[record])
    states, coverage = enumerate_states(source, options)
    state_rows, conformer_rows = [], []
    with (
        Chem.SDWriter(str(output / "states.sdf")) as state_writer,
        Chem.SDWriter(str(output / "conformers.sdf")) as conf_writer,
    ):
        for state_index, item in enumerate(states):
            mol = item.pop("molecule")
            mol.SetProp("X_DDE_STATE", str(state_index))
            rdDepictor.Compute2DCoords(mol)
            state_writer.write(mol)
            conformers, status = prepare_conformers(source, mol, options)
            state_rows.append({"index": state_index, "conformer_status": status, **item})
            for row in conformers:
                conformer = row.pop("molecule")
                conformer.SetProp("X_DDE_STATE", str(state_index))
                conformer.SetProp("X_DDE_GEOMETRY", "unbound_conformer")
                conf_writer.write(conformer)
                name = f"conformer-{len(conformer_rows) + 1:03d}.sdf"
                with Chem.SDWriter(str(output / name)) as preview_writer:
                    preview_writer.write(conformer)
                row.update(
                    artifact=name,
                    artifact_sha256=hashlib.sha256((output / name).read_bytes()).hexdigest(),
                )
                conformer_rows.append(
                    {"record": len(conformer_rows), "state_index": state_index, **row}
                )
    digests = {
        name: hashlib.sha256((output / name).read_bytes()).hexdigest()
        for name in ("states.sdf", "conformers.sdf")
    }
    return {
        "operation": "molecular_states",
        "complete": True,
        "schema_version": 1,
        "source": ref,
        "options": options.model_dump(mode="json"),
        "states": state_rows,
        "conformers": conformer_rows,
        "coverage": coverage,
        "state_artifact": "states.sdf",
        "conformer_artifact": "conformers.sdf",
        "artifact_sha256": digests,
        "versions": {"rdkit": rdBase.rdkitVersion, "dimorphite_dl": version("dimorphite-dl")},
        "geometry_frame": "unbound_conformer",
        "energy_unit": "kcal/mol",
        "energy_comparison": "same_state_only",
    }


def main():
    directory, output = Path("/input"), Path("/output")
    request = json.loads((directory / "request.json").read_text())
    bindings = json.loads((directory / "bindings.json").read_text())
    if request["operation"] == "library_screen":
        from native_screen import run_screen

        result = run_screen(request, bindings, directory, output)
    elif request["operation"] == "molecular_states":
        result = run(request, bindings, directory, output)
    elif request["operation"] == "pose_cluster":
        from native_cluster import run_cluster

        result = run_cluster(request, bindings, directory, output)
    elif request["operation"] == "molecule_minimize":
        from native_minimization import run_minimization

        result = run_minimization(request, bindings, directory, output)
    else:
        raise ValueError("Unsupported operation in the reviewed chemistry adapter.")
    file = output / "result.json.tmp"
    file.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    file.replace(output / "result.json")


if __name__ == "__main__":
    main()
