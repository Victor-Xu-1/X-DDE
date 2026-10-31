"""One-shot GNINA execution/normalization in the isolated offline container."""

import json
import runpy
import shutil
import subprocess
from pathlib import Path

from bounds import verify_poses
from chemistry import (
    bound,
    comparison_graph,
    digest,
    export_molecule,
    molecule,
    plain_smiles,
    summarize_poses,
)
from flexible_contract import FlexibleReceptor, ReceptorRefinement
from flexible_receptor import normalize, validate_selection
from manifest import BINARY_SHA256, VERSION
from options import DockingOptions, SearchBox, arguments, parse_search_report
from receptor_atoms import parse_atoms
from receptor_input import require_explicit_alternates
from reference import ReferenceGeometry
from scoring import parse_score_only


def main():
    from rdkit import Chem, rdBase

    MoleculeRef = runpy.run_path(str(Path(__file__).parent.parent / "scientific_objects.py"))[
        "MoleculeRef"
    ]
    request = json.loads(Path("/input/request.json").read_text())
    bindings = json.loads(Path("/input/bindings.json").read_text())
    execution = None
    if request.get("constraints"):
        receipt = Path("/input/constraints.json")
        if receipt.stat().st_size > 2 * 1024**2:
            raise ValueError("Constraint snapshot exceeds its bounded limit.")
        execution = json.loads(receipt.read_text())
        if execution["reference"] != request["constraints"] or not execution["executable"]:
            raise ValueError("Native constraint snapshot differs from the task reference.")
    options = DockingOptions.model_validate(request["options"])
    receptor = MoleculeRef.model_validate(request["receptor"])
    ligand = MoleculeRef.model_validate(request["ligand"])
    mode = request["mode"]
    flexible = (
        FlexibleReceptor.model_validate(request["flexible_receptor"])
        if request.get("flexible_receptor") is not None
        else None
    )
    if flexible is not None and mode != "minimize":
        raise ValueError("Selected sidechains require existing-pose local minimization.")
    binary = Path("/opt/gnina/gnina")
    if digest(binary) != BINARY_SHA256:
        raise ValueError("Native executable failed its pinned digest check.")
    protein = bound(receptor, bindings, ".pdb")
    require_explicit_alternates(protein.read_bytes())
    protein_text = protein.read_text()
    if flexible is not None:
        validate_selection(
            parse_atoms(protein.read_bytes(), reject_hydrogens=True),
            flexible.tokens,
            protein.read_bytes(),
        )
    if protein_text.count("MODEL ") > 1 or not any(
        line.startswith("ATOM  ") for line in protein_text.splitlines()
    ):
        raise ValueError("Choose one explicit receptor model with protein atoms.")
    original = molecule(bound(ligand, bindings, ".sdf"), ligand.record, require_pose=mode != "dock")
    for field in ("minimizedAffinity", "CNNscore", "CNNaffinity", "CNN_VS", "CNNaffinity_variance"):
        if original.HasProp(field):
            original.ClearProp(field)
    generated_conformer = False
    if mode == "dock" and not original.GetConformer().Is3D():
        from rdkit.Chem import AllChem

        prepared = Chem.AddHs(original)
        params = AllChem.ETKDGv3()
        params.randomSeed = options.seed
        if AllChem.EmbedMolecule(prepared, params) != 0:
            raise ValueError(
                "Unable to build a valid initial conformer within the native embedding attempt."
            )
        original = Chem.RemoveHs(prepared)
        generated_conformer = True
    root = Path("/output")
    normalized = root / "input-ligand.sdf"
    with Chem.SDWriter(str(normalized)) as writer:
        writer.write(export_molecule(original))
    output = root / "poses.sdf"
    args = [str(binary), "-r", str(protein), "-l", str(normalized)] + arguments(options, mode)
    if flexible is not None:
        args.extend(
            [
                "--flexres",
                ",".join(flexible.tokens),
                "--out_flex",
                str(root / "native-flex-receptor.pdb"),
                "--full_flex_output",
            ]
        )
    search = request.get("search")
    reference_geometry = None
    if mode == "dock":
        if not search or MoleculeRef.model_validate(search["frame"]) != receptor:
            raise ValueError("Search region and receptor frames differ.")
        if search["kind"] == "box":
            box = SearchBox.model_validate(search["box"])
            for axis, center, size in zip("xyz", box.center, box.size, strict=True):
                args.extend(["--center_" + axis, str(center), "--size_" + axis, str(size)])
        elif (
            search["kind"] == "reference_ligand" and search["coordinate_basis"] == "user_confirmed"
        ):
            reference = MoleculeRef.model_validate(search["reference"])
            mol = molecule(bound(reference, bindings, ".sdf"), reference.record, require_pose=True)
            ref_file = root / "reference-ligand.sdf"
            with Chem.SDWriter(str(ref_file)) as writer:
                writer.write(export_molecule(mol))
            reference_geometry = ReferenceGeometry(
                mol, original, protein, search["reference"], "search_reference"
            )
            args.extend(
                ["--autobox_ligand", str(ref_file), "--autobox_add", str(options.autobox_add)]
            )
        else:
            raise ValueError("Unsupported native search region.")
    elif (
        MoleculeRef.model_validate(request["pose_frame"]) != receptor
        or request["pose_coordinate_basis"] != "user_confirmed"
    ):
        raise ValueError("Existing pose lacks receptor-frame confirmation.")
    else:
        reference_geometry = ReferenceGeometry(
            original, original, protein, request["ligand"], "input_pose"
        )
    if mode != "score":
        args.extend(["-o", str(output)])
    log = root / "native.log"
    try:
        with log.open("w") as stream:
            completed = subprocess.run(
                args,
                stdout=stream,
                stderr=subprocess.STDOUT,
                timeout=options.time_limit_seconds,
                check=False,
            )
        if completed.returncode:
            raise RuntimeError("GNINA failed; inspect the retained native log.")
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            "GNINA reached the task wall-time limit; no completed result is claimed."
        ) from exc
    text = log.read_text() if log.stat().st_size <= 8 * 1024**2 else ""
    search_report = parse_search_report(text) if mode == "dock" else None
    if mode == "score":
        metrics = parse_score_only(text, options.cnn_scoring)
        for metric in metrics:
            original.SetProp(metric["name"], str(metric["value"]))
        with Chem.SDWriter(str(output)) as writer:
            writer.write(export_molecule(original))
        poses = [
            {
                "record": 0,
                "valid": True,
                "scores": metrics,
                "smiles": plain_smiles(original),
                "mapping_status": "native_atom_maps",
                "source_to_pose_atoms": list(range(original.GetNumAtoms())),
            }
        ]
    else:
        poses = summarize_poses(output, original, options)
    # Each valid pose is independently addressable for preview and downstream reuse.
    supplier = (
        Chem.SDMolSupplier(str(output), removeHs=True) if any(p["valid"] for p in poses) else None
    )
    verify_poses(supplier, poses, execution)
    if reference_geometry is not None:
        for pose in poses:
            if pose["valid"]:
                pose["reference_rmsd"] = reference_geometry.measure(supplier[pose["record"]])
    qualified = root / "qualified-poses.sdf"
    qualified_record = 0
    with Chem.SDWriter(str(qualified)) as writer:
        for pose in poses:
            if pose["valid"]:
                pose["qualified_record"] = qualified_record
                qualified_record += 1
                writer.write(export_molecule(comparison_graph(supplier[pose["record"]])))
    for pose in poses:
        if pose["valid"]:
            file = root / f"pose-{pose['record'] + 1:03d}.sdf"
            with Chem.SDWriter(str(file)) as writer:
                writer.write(export_molecule(comparison_graph(supplier[pose["record"]])))
            pose["artifact"] = file.name
        elif pose["constraint_checks"]:
            file = root / f"diagnostic-pose-{pose['record'] + 1:03d}.sdf"
            with Chem.SDWriter(str(file)) as writer:
                writer.write(export_molecule(comparison_graph(supplier[pose["record"]])))
            pose["diagnostic_artifact"] = file.name
    refinement = None
    if flexible is None:
        shutil.copyfile(protein, root / "receptor.pdb")
    else:
        raw_receptor = root / "native-flex-receptor.pdb"
        if raw_receptor.is_symlink() or raw_receptor.stat().st_size > 25 * 1024**2:
            raise ValueError("Native full-receptor output is unsafe or oversized.")
        prepared, receipt = normalize(
            protein.read_bytes(),
            raw_receptor.read_bytes(),
            flexible.tokens,
            text,
            output.read_bytes(),
        )
        refinement = ReceptorRefinement.model_validate(receipt).model_dump(mode="json")
        shutil.copyfile(protein, root / "input-receptor.pdb")
        (root / "receptor.pdb").write_bytes(prepared)
    result = {
        "operation": "docking",
        "complete": True,
        "mode": mode,
        "method": "GNINA",
        "software_version": VERSION,
        "binary_sha256": BINARY_SHA256,
        "parser": "RDKit " + rdBase.rdkitVersion,
        "receptor": request["receptor"],
        "ligand": request["ligand"],
        "frame": request["receptor"],
        "options": options.model_dump(mode="json"),
        "search": search,
        **({"search_report": search_report.model_dump()} if search_report else {}),
        "reference_comparison": reference_geometry.metadata if reference_geometry else None,
        "initial_conformer_generated": generated_conformer,
        "poses": poses,
        "pose_artifact": "qualified-poses.sdf",
        "raw_pose_artifact": "poses.sdf",
        "constraint_reference": request.get("constraints"),
        "receptor_artifact": "receptor.pdb",
        **({"receptor_refinement": refinement} if refinement is not None else {}),
        "scientific_outcome": "candidates" if any(p["valid"] for p in poses) else "no_valid_pose",
        "scientific_acceptance": "pending_server_validation",
        "coordinate_provenance": "user_confirmed"
        if mode != "dock" or search["kind"] == "reference_ligand"
        else "receptor_anchored_box",
        "notes": "Empirical docking scores and model outputs are not measured affinity. "
        "Chemical/coordinate checks are not a complete pose-quality or binding benchmark.",
    }
    temporary = root / "result.json.tmp"
    temporary.write_text(json.dumps(result, indent=2, allow_nan=False))
    temporary.replace(root / "result.json")


if __name__ == "__main__":
    main()
