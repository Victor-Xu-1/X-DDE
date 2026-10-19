"""Build and exercise channel dependencies and readiness without a research calculation."""

import argparse
import asyncio
import json
import subprocess
from pathlib import Path

from opendde_workbench.deployment.space_install import install_space
from opendde_workbench.locations import atomic_json
from opendde_workbench.settings import Settings
from opendde_workbench.space.image import labels_match, lock_digest
from opendde_workbench.space.manifest import VERSION
from opendde_workbench.space.runtime import configuration, readiness


def execute(args, timeout=30):
    return subprocess.check_output([str(arg) for arg in args], text=True, timeout=timeout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=False)
    state = root / "state"
    state.mkdir()
    settings = Settings(
        state_dir=state,
        image_file=state / "image",
        code_file=state / "code",
        model_dir=root / "models",
        cache_dir=state / "cache",
    )
    before = asyncio.run(readiness(settings))
    assert not before["ready"]
    installed = install_space(root, root / "work", execute, print, lambda: None)
    installed["version"] = VERSION
    atomic_json(state / "deployment.json", {"root": str(root)})
    atomic_json(root / "installed.json", {"caver": installed})
    image = configuration(settings)
    labels = json.loads(
        execute(["docker", "image", "inspect", "--format", "{{json .Config.Labels}}", image])
    )
    assert labels_match(labels)
    actual = execute(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--user",
            "65534:65534",
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
            "--entrypoint",
            "python",
            image,
            "-c",
            "import json, Bio, numpy, pydantic; "
            "print(json.dumps({'biopython':Bio.__version__, 'numpy':numpy.__version__, "
            "'pydantic':pydantic.__version__}))",
        ]
    )
    versions = json.loads(actual)
    assert versions == {"biopython": "1.88", "numpy": "1.26.4", "pydantic": "2.13.5"}
    after = asyncio.run(readiness(settings))
    assert after["ready"], after
    atomic_json(
        root / "installed.json",
        {
            "caver": {
                **installed,
                "runtime_lock_sha256": "b" * 64,
            }
        },
    )
    changed = asyncio.run(readiness(settings))
    assert not changed["ready"]
    atomic_json(root / "installed.json", {"caver": installed})
    assert asyncio.run(readiness(settings))["ready"]
    atomic_json(
        root / "acceptance.json",
        {
            "image": image,
            "lock_sha256": lock_digest(),
            "labels": labels,
            "versions": versions,
            "uninstalled": before,
            "installed": after,
            "changed_lock_rejected": changed,
            "research_calculations": 0,
        },
    )
    print(json.dumps({"image": image, "ready": True, "research_calculations": 0}))


if __name__ == "__main__":
    main()
