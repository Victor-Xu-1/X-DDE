"""Native MZ1 binary controls with an independently translated full-molecule input."""

import json
import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

from proximity_adapter_probe import run_adapter

from opendde_workbench.integrations.backend import ScientificBackend


def prepare_binary_inputs(root, image):
    if os.environ.get("CI") != "true":
        raise RuntimeError("Run native inference controls in isolated CI.")
    inputs = root / "binary-inputs"
    inputs.mkdir()
    adapter = root / "binary-preparation-adapter"
    adapter.mkdir()
    backend = ScientificBackend(None, "deepternary")
    for name in backend.files:
        shutil.copyfile(backend.shared_sources.get(name, backend.root / name), adapter / name)
    container = "xdde-binary-inputs-" + uuid4().hex
    command = [
        "docker",
        "run",
        "--rm",
        "--name",
        container,
        "--network",
        "none",
        "--read-only",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "512m",
        "--cpus",
        "1",
        "--pids-limit",
        "64",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=64m",
    ]
    for source, target, readonly in (
        (root / "inputs", "/inputs", True),
        (adapter, "/platform", True),
        (inputs, "/output", False),
    ):
        command += [
            "--mount",
            f"type=bind,source={source},target={target}" + (",readonly" if readonly else ""),
        ]
    entry = Path(__file__).with_name("proximity_binary_inputs.py").resolve()
    command += [
        "--mount",
        f"type=bind,source={entry},target=/probe/prepare.py,readonly",
        "--env",
        "PYTHONPATH=/platform",
        "--entrypoint",
        "python",
        image,
        "-B",
        "/probe/prepare.py",
    ]
    try:
        subprocess.run(command, check=True, timeout=90)
    finally:
        subprocess.run(
            ["docker", "rm", "--force", container],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return inputs


def compare_binary_outputs(root, jobs):
    first, second = [
        json.loads((job / "output/result.json").read_text())["proximity"] for job in jobs
    ]
    for a, b in zip(first["assemblies"], second["assemblies"], strict=True):
        # PDB writing retains 0.001-A precision. Compare raw ligand SDF positions
        # at 0.0001 A, allowing native float32 rounding from the shifted input.
        x = (jobs[0] / "output" / a["ligand_artifact"]).read_text().splitlines()
        y = (jobs[1] / "output" / b["ligand_artifact"]).read_text().splitlines()
        count = int(x[3][:3])
        assert count == int(y[3][:3])
        for aa, bb in zip(x[4 : 4 + count], y[4 : 4 + count], strict=True):
            assert (
                max(abs(float(aa[i : i + 10]) - float(bb[i : i + 10])) for i in (0, 10, 20)) < 0.01
            )
        for left, right in zip(
            a["partner_b_transform"]["rotation"], b["partner_b_transform"]["rotation"], strict=True
        ):
            assert max(abs(aa - bb) for aa, bb in zip(left, right, strict=True)) < 0.001
        assert (
            max(
                abs(aa - bb)
                for aa, bb in zip(
                    a["partner_b_transform"]["translation"],
                    b["partner_b_transform"]["translation"],
                    strict=True,
                )
            )
            < 0.01
        )
        assert a["quality"]["accepted"] == b["quality"]["accepted"]
    (root / "binary-frame-invariance.json").write_text(
        json.dumps(
            {
                "native_model_executed": True,
                "independent_full_input_translation_A": [350, -120, 80],
                "anchor_partner": "b",
                "returned_per_case": len(first["assemblies"]),
                "canonical_source_partner_a_verified": True,
                "full_model_coordinate_invariance_passed": True,
                "scientific_accuracy_accepted": False,
            },
            indent=2,
        )
    )


def run_binary_cases(root, image, models):
    inputs = prepare_binary_inputs(root, image)
    jobs = []
    for variant in ("original", "translated"):
        directory = inputs / variant
        for name in ("protein1.pdb", "protein2.pdb"):
            shutil.copyfile(root / "inputs" / name, directory / name)
        jobs.append(
            run_adapter(
                root,
                image,
                models,
                binary_case={"id": "binary-target-" + variant, "inputs": directory},
            )
        )
    compare_binary_outputs(root, jobs)
