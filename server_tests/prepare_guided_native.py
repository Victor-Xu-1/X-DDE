"""Prepare only the chosen real native profile in isolated CI, never owner state."""

import argparse
import json
import os
import subprocess
from pathlib import Path

from opendde_workbench.deployment.manager import DeploymentManager


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--program", choices=("mol1", "openmm"), default="mol1")
    program = parser.parse_args().program
    if os.environ.get("CI") != "true":
        raise RuntimeError("This native installation belongs to isolated CI.")
    root = Path(os.environ["WB_MOL1_CASE"]).resolve()
    if not root.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve()):
        raise RuntimeError("Native acceptance must use the isolated runner workspace.")
    root.mkdir(parents=True, exist_ok=True)
    manager = DeploymentManager(root / "state")
    manager.configure(str(root / "components"), False)
    for identifier in (("mol1-models" if program == "mol1" else "openmm"), "molstar"):
        operations = manager.enqueue(identifier, "install")
        for _ in operations:
            manager.tick()
        for operation in operations:
            row = manager.store.get(operation)
            if row["state"] != "succeeded":
                for file in (root / "components").rglob("install.log"):
                    print(file.read_text(errors="replace")[-12000:])
                raise RuntimeError(f"Native component installation failed: {identifier}: {row}")
    (root / "installation.json").write_text(json.dumps(manager.store.installed(), indent=2))
    if program == "mol1":
        from opendde_workbench.deployment.native_probe import run_probe

        installed = manager.store.installed()
        source = Path(__file__).resolve().parents[1] / "src/opendde_workbench/integrations"
        checks = Path(__file__).with_name("mol1_native_identity.py").resolve()
        models = Path(installed["mol1-models"]["models"])
        image = installed["mol1"]["image"]

        def execute(arguments, timeout):
            completed = subprocess.run(
                arguments,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=timeout,
            )
            if completed.returncode:
                print(completed.stdout[-15000:])
                completed.check_returncode()
            return completed.stdout

        run_probe(
            "mol1",
            image,
            [
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
                "4096m",
                "--cpus",
                "1",
                "--pids-limit",
                "64",
                "--tmpfs",
                "/tmp:rw,nosuid,nodev,size=512m",
                "--env",
                "HOME=/tmp",
                "--env",
                "OMP_NUM_THREADS=1",
                "--env",
                "OPENBLAS_NUM_THREADS=1",
                "--env",
                "LAYERNORM_TYPE=torch",
                "--env",
                "MOL_ROOT_DIR=/models",
                "--env",
                "PYTHONPATH=/adapters",
                "--mount",
                f"type=bind,source={source},target=/adapters,readonly",
                "--mount",
                f"type=bind,source={checks},target=/checks.py,readonly",
                "--mount",
                f"type=bind,source={models},target=/models,readonly",
                "--entrypoint",
                "python",
                image,
                "/checks.py",
            ],
            execute,
            root / "native-parser-probe",
        )
    if program == "openmm":
        from opendde_workbench.examples.stat6.catalogue import verified_input
        from opendde_workbench.examples.stat6.domain_inputs import FIRST, LAST, domain_coordinates

        canonical = "".join(verified_input("stat6_sequence").decode().splitlines()[1:])
        coordinates = domain_coordinates(
            verified_input("stat6_predicted_construct"), canonical[FIRST - 1 : LAST]
        )
        (root / "STAT6-SH2-source.pdb").write_bytes(coordinates)
    print("Reviewed native profile and molecular viewer prepared: " + program)


if __name__ == "__main__":
    main()
