"""Run the actual reviewed X-DDE adapter in the isolated native baseline image."""

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

from opendde_workbench.integrations.backend import ScientificBackend
from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.integrations.result import validate_result
from opendde_workbench.integrations.specs import recipe_digest
from opendde_workbench.proximity.options import TernaryPayload


def run_adapter(root, image, models):
    if os.environ.get("CI") != "true":
        raise RuntimeError("Native model acceptance belongs in isolated CI.")
    # Freeze actual selected official bytes under the same manifest contract as installation.
    (models / "manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "program": "deepternary",
                "recipe_sha256": recipe_digest("deepternary"),
                "files": [
                    {
                        "name": file.name,
                        "size": file.stat().st_size,
                        "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                    }
                    for file in sorted(models.iterdir())
                    if file.is_file()
                ],
            }
        )
    )
    work = root / "adapter-job"
    work.mkdir()
    assets = work / "assets"
    assets.mkdir()
    bindings, inputs = {}, []
    for role, name in (
        ("partner_a", "protein1.pdb"),
        ("partner_b", "protein2.pdb"),
        ("ligand", "ligand.sdf"),
    ):
        source = root / "inputs" / name
        identifier = str(uuid4())
        copied = assets / (identifier + source.suffix)
        shutil.copyfile(source, copied)
        ref = {
            "asset_id": identifier,
            "record": 0,
            "sha256": hashlib.sha256(copied.read_bytes()).hexdigest(),
        }
        bindings[identifier] = "/job/assets/" + copied.name
        inputs.append({"role": role, "source": ref})
    payload = TernaryPayload(
        input_mode="shared_complex",
        mechanism="protac",
        partner_a_name="VHL",
        partner_b_name="BRD4",
        partner_a_chain="A",
        partner_b_chain="B",
        samples=3,
        attempt_budget=3,
        wall_seconds=600,
        binding_region_a=list(range(32)),
        binding_region_b=list(range(42, 69)),
    )
    request = IntegratedTask(
        operation="ternary_model",
        name="MZ1鈥揃RD4鈥揤HL adapter acceptance",
        inputs=inputs,
        payload=payload,
        scientific_inputs=[item["source"] for item in inputs],
        options={"device": "cpu", "cpu": 2, "memory_mib": 6144, "seed": 31},
    )
    (work / "request.json").write_text(request.model_dump_json())
    (work / "bindings.json").write_text(json.dumps(bindings))
    adapter = work / "adapter"
    adapter.mkdir()
    backend = ScientificBackend(None, "deepternary")
    for name in backend.files:
        source = backend.shared_sources.get(name, backend.root / name)
        shutil.copyfile(source, adapter / name)
    output = work / "output"
    output.mkdir()
    entry = Path(__file__).with_name("proximity_native_entry.py").resolve()
    container = "xdde-proximity-adapter-" + uuid4().hex
    arguments = [
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
        "XDDE_PROGRAM=deepternary",
        "--env",
        "MPLCONFIGDIR=/tmp/matplotlib",
    ]
    for host, target, readonly in (
        (assets, "/input/assets", True),
        (work / "request.json", "/input/request.json", True),
        (work / "bindings.json", "/input/bindings.json", True),
        (adapter, "/platform", True),
        (models, "/models", True),
        (entry, "/probe/entry.py", True),
        (output, "/output", False),
    ):
        arguments += [
            "--mount",
            f"type=bind,source={host},target={target}" + (",readonly" if readonly else ""),
        ]
    arguments += ["--entrypoint", "python", image, "-B", "/probe/entry.py"]
    try:
        with (work / "execution.log").open("wb") as log:
            subprocess.run(
                arguments,
                check=True,
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=660,
            )
    except BaseException:
        print((work / "execution.log").read_text()[-12000:])
        subprocess.run(
            ["docker", "rm", "--force", container], check=False, stdout=subprocess.DEVNULL
        )
        raise
    report = validate_result(json.loads((output / "result.json").read_text()), request, output)
    if report.proximity.search.returned != 3:
        raise AssertionError("The real adapter did not finish its declared three proposals.")
    receipt = json.loads((output / "native-checks.json").read_text())
    receipt.update(
        {
            "platform_contract_verified": True,
            "image": image,
            "assemblies": len(report.proximity.assemblies),
            "qualified": sum(row.quality.accepted for row in report.proximity.assemblies),
            "scientific_accuracy_accepted": False,
            "owner_inference": False,
        }
    )
    (work / "acceptance.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))
    return work
