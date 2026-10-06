"""The existing verified GNINA binary and pose validator execute a bounded candidate batch."""

import json
import subprocess
from pathlib import Path

from docking_chemistry import comparison_graph, digest, molecule, summarize_poses
from docking_manifest import BINARY_SHA256, VERSION
from docking_options import DockingOptions, SearchBox, arguments
from docking_receptor import prepare as prepare_receptor
from platformnative_io import finish, input_file, progress, source_result, write_csv


def pocket_arguments(request):
    from rdkit import Chem

    search, options = request["payload"]["search"], request["payload"]["docking"]
    if search["kind"] == "box":
        box = SearchBox.model_validate(search["box"])
        return [
            value
            for axis, center, size in zip("xyz", box.center, box.size, strict=True)
            for value in ("--center_" + axis, str(center), "--size_" + axis, str(size))
        ]
    file, reference = input_file(request, "ligand")
    selected = molecule(file, reference["record"], require_pose=True)
    with Chem.SDWriter("/output/reference-ligand.sdf") as writer:
        writer.write(selected)
    return [
        "--autobox_ligand",
        "/output/reference-ligand.sdf",
        "--autobox_add",
        str(options["autobox_add"]),
    ]


def run(request):
    from library_records import unbound_conformer
    from rdkit import Chem

    options = DockingOptions.model_validate(request["payload"]["docking"])
    binary = Path("/opt/gnina/gnina")
    if digest(binary) != BINARY_SHA256:
        raise ValueError("GNINA executable differs from the reviewed immutable binary.")
    receptor, _ = input_file(request, "structure")
    if receptor.suffix != ".pdb":
        raise ValueError(
            "Prepare the selected receptor as a single-model PDB before GNINA docking."
        )
    receptor = prepare_receptor(
        receptor,
        request["payload"].get("retain_heterogens", []),
        request["payload"].get("alternate_locations", "reject"),
    )
    text = receptor.read_text()
    if text.count("MODEL ") > 1 or not any(line.startswith("ATOM  ") for line in text.splitlines()):
        raise ValueError("Batch docking needs one observed protein receptor model.")
    root, result = source_result(request)
    candidates = {row["id"]: row for row in result["candidates"]}
    selected = request["payload"]["selected_ids"]
    if any(
        identifier not in candidates or not candidates[identifier].get("artifact")
        for identifier in selected
    ):
        raise ValueError(
            "Choose confirmed candidate molecules; retain more molecules before batch docking."
        )
    region = pocket_arguments(request)
    folder = Path("/output/native-docking")
    folder.mkdir()
    rows, failures, poses, artifacts = [], [], [], {}
    writer = Chem.SDWriter("/output/best-poses.sdf")
    try:
        for index, identifier in enumerate(selected):
            original = candidates[identifier]
            try:
                source = molecule(root / original["artifact"], original["record"])
                if not source.GetConformer().Is3D():
                    source = unbound_conformer(source, options.seed + index)
                for prop in (
                    "minimizedAffinity",
                    "CNNscore",
                    "CNNaffinity",
                    "CNN_VS",
                    "CNNaffinity_variance",
                ):
                    if source.HasProp(prop):
                        source.ClearProp(prop)
                input_path = folder / f"input-{index:04d}.sdf"
                output = folder / f"poses-{index:04d}.sdf"
                log = folder / f"native-{index:04d}.log"
                with Chem.SDWriter(str(input_path)) as single:
                    single.write(source)
                command = [
                    str(binary),
                    "-r",
                    str(receptor),
                    "-l",
                    str(input_path),
                    "-o",
                    str(output),
                    *arguments(options, "dock"),
                    *region,
                ]
                with log.open("w") as stream:
                    completed = subprocess.run(
                        command,
                        stdout=stream,
                        stderr=subprocess.STDOUT,
                        timeout=options.time_limit_seconds,
                        check=False,
                    )
                if completed.returncode:
                    raise RuntimeError("native_gnina_failure")
                native = summarize_poses(output, source, options)
                valid = [pose for pose in native if pose["valid"]]
                if not valid:
                    raise ValueError("no_chemically_valid_native_pose")

                def empirical(pose):
                    return next(
                        score["value"]
                        for score in pose["scores"]
                        if score["name"] == "minimizedAffinity"
                    )

                best = min(valid, key=empirical)
                supplier = Chem.SDMolSupplier(str(output), removeHs=True)
                pose = comparison_graph(supplier[best["record"]])
                pose.SetProp("_Name", identifier)
                pose.SetProp("XDDE_COMPOUND_ID", identifier)
                pose.SetProp("XDDE_GEOMETRY", "binding_pose")
                qualified = f"pose-{index + 1:04d}.sdf"
                with Chem.SDWriter("/output/" + qualified) as single:
                    single.write(pose)
                from pose_complex import export as export_complex

                complex_artifact = f"complex-{index + 1:04d}.pdb"
                export_complex("/output/receptor.pdb", pose, "/output/" + complex_artifact)
                writer.write(pose)
                scores = {item["name"]: item["value"] for item in best["scores"]}
                poses.append(
                    {
                        **original,
                        "artifact": "best-poses.sdf",
                        "record": len(poses),
                        "geometry": "binding_pose",
                        "complex_artifact": complex_artifact,
                        "docking_score": scores["minimizedAffinity"],
                        "cnn_score": scores.get("CNNscore"),
                        "cnn_affinity": scores.get("CNNaffinity"),
                    }
                )
                rows.append(
                    [
                        identifier,
                        "pose",
                        scores["minimizedAffinity"],
                        scores.get("CNNscore"),
                        scores.get("CNNaffinity"),
                        original.get("score"),
                        qualified,
                        len(valid),
                        "",
                    ]
                )
                artifacts[qualified] = "qualified_binding_pose"
                artifacts[complex_artifact] = "qualified_pose_complex"
            except (ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
                reason = (
                    "native_time_limit"
                    if isinstance(exc, subprocess.TimeoutExpired)
                    else str(exc)[:240]
                )
                failures.append([identifier, reason])
                rows.append(
                    [identifier, "failed", None, None, None, original.get("score"), "", 0, reason]
                )
            progress("Docking selected candidates", index + 1, len(selected))
    finally:
        writer.close()
    write_csv(
        "/output/docking-candidates.csv",
        [
            "compound",
            "status",
            "GNINA_kcal_per_mol",
            "CNNscore",
            "CNNaffinity_model_output",
            "upstream_score",
            "pose_file",
            "qualified_modes",
            "failure",
        ],
        rows,
    )
    write_csv("/output/docking-failures.csv", ["compound", "reason"], failures)
    artifacts.update(
        {
            "receptor.pdb": "docking_receptor",
            "docking-candidates.csv": "candidate_docking_scores",
            "docking-failures.csv": "candidate_failures",
        }
    )
    if poses:
        artifacts["best-poses.sdf"] = "qualified_binding_poses"
    else:
        Path("/output/best-poses.sdf").unlink()
    if request["payload"]["search"]["kind"] == "reference_ligand":
        artifacts["reference-ligand.sdf"] = "pocket_reference"
    Path("/output/docking-method.json").write_text(
        json.dumps(
            {
                "binary_sha256": BINARY_SHA256,
                "software_version": VERSION,
                "options": options.model_dump(),
                "receptor": request["payload"]["receptor"],
                "preparation": "original ATOM coordinates; explicitly retained HETATM cofactors",
                "retained_heterogens": request["payload"].get("retain_heterogens", []),
                "search": request["payload"]["search"],
                "candidate_set": request["sources"][0],
                "pose_validation": "existing_GNINA_chemical_identity_and_coordinate_validator",
                "independent_posebusters": "not_run; available as separate follow-up",
            }
        )
    )
    artifacts["docking-method.json"] = "docking_method"
    finish(
        request,
        VERSION,
        "screening",
        artifacts,
        candidates=poses,
        molecule_artifact="best-poses.sdf" if poses else None,
        counts={"selected": len(selected), "docked": len(poses), "failed": len(failures)},
        metadata={
            "method": "GNINA",
            "receptor": request["payload"]["receptor"],
            "score_unit": "kcal/mol",
            "scope": "actual qualified poses; empirical scores are not measured affinity",
            "scientific_outcome": "poses" if poses else "no_valid_poses",
        },
    )
