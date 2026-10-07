"""Freeze and verify the official CPU ternary baseline in an isolated CI runner."""

import argparse
import json
import os
import subprocess
import zipfile
from pathlib import Path
from uuid import uuid4

from opendde_workbench.deployment.model_members import extract_selected
from opendde_workbench.deployment.transfers import download, extract
from opendde_workbench.integrations.image import lock_digest, prepare_context
from opendde_workbench.integrations.specs import PROGRAMS, recipe_digest


def main(root):
    if os.environ.get("CI") != "true":
        raise RuntimeError("Run this scientific baseline in the isolated CI environment.")
    root.mkdir(parents=True, exist_ok=False)
    spec = PROGRAMS["deepternary"]
    source = spec["source"]
    archive = root / "source.zip"

    def checkpoint():
        pass

    report = print
    download(source["url"], archive, source["sha256"], report, checkpoint)
    extract(archive, root / "source", checkpoint)
    context = root / "context"
    prepare_context("deepternary", context, root / "source" / source["prefix"])
    weights = spec["models"][0]
    archive = root / "models.zip"
    download(weights["url"], archive, weights["sha256"], report, checkpoint, limit=weights["size"])
    models = root / "models"
    models.mkdir()
    extract_selected(archive, models, weights["selected_members"], checkpoint)
    inputs = root / "inputs"
    inputs.mkdir()
    selected = (
        "ligand.pdb",
        "ligand.sdf",
        "unbound_protein1.pdb",
        "unbound_protein2.pdb",
        "unbound_lig1.pdb",
        "unbound_lig2.pdb",
        "protein1.pdb",
        "protein2.pdb",
    )
    with zipfile.ZipFile(archive) as bundle:
        for name in selected:
            member = "output/protac22/5T35_H_E_759/" + name
            data = bundle.read(member)
            if len(data) > 5 * 1024**2:
                raise ValueError("Official case exceeds the reviewed member limit.")
            (inputs / name).write_bytes(data)
    image = "xdde-deepternary-probe:" + uuid4().hex
    with (root / "build.log").open("wb") as log:
        subprocess.run(
            ["docker", "build", "--tag", image, str(context)],
            check=True,
            stdout=log,
            stderr=subprocess.STDOUT,
            timeout=900,
        )
    image_id = subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", image], text=True
    ).strip()
    output = root / "output"
    output.mkdir()
    entry = Path(__file__).with_name("deepternary_protocol_entry.py").resolve()
    container = "xdde-deepternary-probe-" + uuid4().hex
    args = [
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
        "6g",
        "--cpus",
        "2",
        "--pids-limit",
        "96",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=512m",
        "--env",
        "HOME=/tmp",
        "--env",
        "OMP_NUM_THREADS=2",
        "--env",
        "DGLBACKEND=pytorch",
        "--env",
        "MPLCONFIGDIR=/tmp/matplotlib",
    ]
    for host, target, readonly in (
        (inputs, "/inputs", True),
        (models, "/models", True),
        (entry, "/platform/entry.py", True),
        (output, "/output", False),
    ):
        args += [
            "--mount",
            f"type=bind,source={host},target={target}" + (",readonly" if readonly else ""),
        ]
    args += [image_id, "python", "/platform/entry.py"]
    try:
        with (root / "execution.log").open("wb") as log:
            subprocess.run(args, check=True, stdout=log, stderr=subprocess.STDOUT, timeout=660)
    except BaseException:
        subprocess.run(
            ["docker", "rm", "--force", container], check=False, stdout=subprocess.DEVNULL
        )
        raise
    receipt = json.loads((output / "protocol.json").read_text())
    receipt.update(
        {
            "image": image_id,
            "recipe_sha256": recipe_digest("deepternary"),
            "lock_sha256": lock_digest("deepternary"),
            "source": source["sha256"],
            "models_archive": weights["sha256"],
        }
    )
    (root / "acceptance.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))
    from proximity_adapter_probe import run_adapter

    run_adapter(root, image_id, models)
    from proximity_api_acceptance import run_platform

    run_platform(root)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    main(parser.parse_args().output.resolve())
