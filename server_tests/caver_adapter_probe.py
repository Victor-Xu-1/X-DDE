"""Exercise the real adapter composition on the frozen drug complex, only in CI."""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

from opendde_workbench.space.adapter_sources import FILES, ROOT, SHARED_SOURCES
from opendde_workbench.space.contract import ChannelTask


def invoke(image, adapter, inputs, output, *, success):
    output.mkdir(parents=True, exist_ok=False)
    name = "xdde-caver-adapter-probe-" + uuid4().hex
    args = [
        "docker",
        "run",
        "--rm",
        "--name",
        name,
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
        "2048m",
        "--cpus",
        "2",
        "--pids-limit",
        "64",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=256m",
        "--env",
        "HOME=/tmp",
        "--env",
        "OMP_NUM_THREADS=2",
        "--mount",
        f"type=bind,source={adapter},target=/platform,readonly",
        "--mount",
        f"type=bind,source={inputs},target=/input,readonly",
        "--mount",
        f"type=bind,source={output},target=/output",
        "--entrypoint",
        "python",
        image,
        "-B",
        "/platform/runner.py",
    ]
    try:
        with (output / "probe.log").open("w") as log:
            result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT, timeout=240)
    finally:
        subprocess.run(["docker", "rm", "--force", name], capture_output=True, timeout=20)
    if success and result.returncode:
        print((output / "probe.log").read_text())
        if (output / "native.log").exists():
            print((output / "native.log").read_text()[-5000:])
        raise RuntimeError("The actual composed native adapter failed.")
    if not success:
        assert result.returncode and not (output / "result.json").exists()
        assert "radius is undefined" in (output / "probe.log").read_text()


def input_snapshot(root, data):
    identifier = str(uuid4())
    inputs = root
    (inputs / "assets").mkdir(parents=True)
    file = inputs / "assets" / (identifier + ".pdb")
    file.write_bytes(data)
    reference = {
        "asset_id": identifier,
        "sha256": hashlib.sha256(data).hexdigest(),
        "record": 0,
        "conformer": 0,
        "version_id": None,
    }
    task = ChannelTask(
        structure=reference,
        scientific_inputs=[reference],
        starting_regions=[{"chain": "A", "number": 604, "insertion_code": "", "resname": "E20"}],
        options={"context_chains": ["A"], "alternate": "A"},
    )
    (inputs / "request.json").write_text(task.model_dump_json())
    (inputs / "bindings.json").write_text(json.dumps({identifier: "/job/assets/" + file.name}))
    return task


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", type=Path, required=True)
    args = parser.parse_args()
    root = args.protocol.resolve()
    accepted = json.loads((root / "protocol-acceptance.json").read_text())
    output = root / "adapter-acceptance"
    output.mkdir(exist_ok=False)
    adapter = output / "adapter"
    adapter.mkdir()
    for name in FILES:
        shutil.copyfile(ROOT / name, adapter / name)
    for name, file in SHARED_SOURCES.items():
        shutil.copyfile(file, adapter / name)
    data = (root / "4EY7.pdb").read_bytes()
    task = input_snapshot(output / "input", data)
    invoke(accepted["image"], adapter, output / "input", output / "actual", success=True)
    result = json.loads((output / "actual/result.json").read_text())
    assert result["operation"] == "channel_analysis" and result["complete"]
    assert result["structure"] == task.structure.model_dump(mode="json")
    assert result["options"] == task.options.model_dump(mode="json")
    assert result["channels"] and result["context"]["removed_starting_ligand_count"] == 1
    assert result["preparation"]["resolved_alternates"], (
        "Real ambiguous coordinates must be resolved explicitly"
    )
    assert result["preparation"]["options"]["alternate"] == "A"
    assert result["preparation"]["unobserved_atoms"] == "not_generated"
    assert hashlib.sha256(data).hexdigest() == task.structure.sha256
    for name, digest in result["artifacts"].items():
        with (output / "actual" / name).open("rb") as stream:
            assert hashlib.file_digest(stream, "sha256").hexdigest() == digest
    # Add a controlled unsupported metal to the real source; never use CAVER's unknown radius.
    source = data.decode("ascii").splitlines()
    atoms = [row for row in source if row.startswith(("ATOM  ", "HETATM"))]
    serial = max(int(row[6:11]) for row in atoms) + 1
    counter = (
        f"HETATM{serial:5d} FE    FE A9999       0.000   0.000   0.000  1.00 20.00          FE  "
    )
    modified = (
        "\n".join([row for row in source if row not in {"END", "ENDMDL"}] + [counter, "END"]) + "\n"
    )
    input_snapshot(output / "unsupported-input", modified.encode("ascii"))
    invoke(
        accepted["image"],
        adapter,
        output / "unsupported-input",
        output / "unsupported",
        success=False,
    )
    receipt = {
        "source_revision": os.environ["GITHUB_SHA"],
        "actual_adapter": True,
        "channels": len(result["channels"]),
        "original_source_preserved": True,
        "explicit_alternate_selection": len(result["preparation"]["resolved_alternates"]),
        "native_prepared_structure": result["preparation"]["artifact"],
        "undefined_radius_rejected": True,
        "artifact_checksums_verified": len(result["artifacts"]),
        "scientific_acceptance": "native_protocol_only_not_whole_linker_or_experimental_binding",
    }
    (root / "adapter-acceptance.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
