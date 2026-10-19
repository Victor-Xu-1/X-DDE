"""Exercise the canonical staged receptor adapter inside an actual isolated image."""

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from opendde_workbench.receptors.backend import ReceptorBackend
from opendde_workbench.settings import Settings


def execution(command, *, directory, timeout=900):
    result = subprocess.run(
        [str(value) for value in command], capture_output=True, text=True, timeout=timeout
    )
    with (directory / "native-runtime.log").open("a", encoding="utf-8") as stream:
        stream.write(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError((result.stdout + result.stderr)[-5000:])
    return result.stdout


def run_native(root, image, request, sources):
    directory = root / str(uuid4())
    directory.mkdir()
    for name in ("adapter", "assets", "output"):
        (directory / name).mkdir()
    backend = ReceptorBackend(
        Settings(
            state_dir=directory / "unused-state",
            image_file=directory / "unused-image",
            code_file=directory / "unused-code",
            model_dir=directory / "unused-models",
            cache_dir=directory / "unused-cache",
            biopython_image=image,
        )
    )
    for name in backend.files:
        path = backend.shared_sources.get(name, backend.root / name)
        shutil.copyfile(path, directory / "adapter" / name)
    bindings = {}
    for identifier, path in sources.items():
        name = identifier + path.suffix
        shutil.copyfile(path, directory / "assets" / name)
        bindings[identifier] = "/job/assets/" + name
    (directory / "request.json").write_text(request.model_dump_json(), encoding="utf-8")
    (directory / "bindings.json").write_text(json.dumps(bindings), encoding="utf-8")
    args = [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--memory",
        "2048m",
        "--cpus",
        "1",
        "--pids-limit",
        "64",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=128m",
        "--env",
        "HOME=/tmp",
    ]
    for source, target, readonly in (
        (directory / "adapter", "/platform", True),
        (directory / "assets", "/input/assets", True),
        (directory / "request.json", "/input/request.json", True),
        (directory / "bindings.json", "/input/bindings.json", True),
        (directory / "output", "/output", False),
    ):
        args.extend(
            [
                "--mount",
                f"type=bind,source={source},target={target}" + (",readonly" if readonly else ""),
            ]
        )
    args.extend(["--entrypoint", "python", image, "-B", "/platform/runner.py"])
    execution(args, directory=root)
    output = directory / "output"
    value = json.loads((output / "result.json").read_bytes())
    for name, expected in value["artifact_sha256"].items():
        assert Path(name).name == name
        assert hashlib.sha256((output / name).read_bytes()).hexdigest() == expected
    return SimpleNamespace(value=value, output=output)
