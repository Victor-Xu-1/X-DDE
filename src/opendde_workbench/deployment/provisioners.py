"""Product provisioner role wraps only reviewed upstream configuration interfaces."""

import json
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from .catalog import PACKAGES

OPEN_PACKAGES = frozenset({"runtime", "compute", "standard", "abag"})


class EnvironmentProvisioner(Protocol):
    def prepare(
        self,
        package: str,
        root: Path,
        work: Path,
        installed: dict,
        execute: Callable,
        report: Callable,
    ) -> dict: ...
    def status(self, installed: dict) -> dict: ...


class OpenDDEProvisioner:
    """OpenDDE product role; concrete implementation is the official Harness installer."""

    def status(self, installed: dict) -> dict:
        client = installed.get("harness", {})
        python = client.get("python")
        ready = bool(
            python
            and Path(python).is_file()
            and client.get("version") == PACKAGES["harness"].version
        )
        return {
            "id": "opendde",
            "name": "OpenDDE",
            "role": "environment_configuration",
            "implementation": "OpenDDE Harness installer",
            "version": PACKAGES["harness"].version,
            "ready": ready,
            "reason": None if ready else "Install the reviewed Harness configuration client.",
            "actions": ["prepare_runtime_code", "verify_compute_image", "prepare_model_resources"],
            "lifecycle_owner": "X-DDE",
        }

    def prepare(
        self,
        package: str,
        root: Path,
        work: Path,
        installed: dict,
        execute: Callable,
        report: Callable,
    ) -> dict:
        if package not in OPEN_PACKAGES:
            raise ValueError("OpenDDE provisioner does not support this component.")
        if not self.status(installed)["ready"]:
            raise RuntimeError("The reviewed environment configuration client is unavailable.")
        python = installed["harness"]["python"]

        def native(action: str, target: Path) -> dict:
            text = execute([python, Path(__file__).with_name("native_setup.py"), action, target])
            prefix = "WORKBENCH_RESULT="
            body = next(
                (line[len(prefix) :] for line in text.splitlines() if line.startswith(prefix)), None
            )
            if body is None:
                raise RuntimeError("Native configuration did not return a verified result.")
            result = json.loads(body)
            field = "code" if action == "code" else "image"
            if not isinstance(result, dict) or not isinstance(result.get(field), str):
                raise RuntimeError("Native configuration returned an invalid result contract.")
            return result

        if package == "runtime":
            report("Preparing official OpenDDE, PLIP and MPNN sources")
            return native("code", root / "code")
        if package == "compute":
            if not shutil.which("docker"):
                raise RuntimeError("Docker is missing. Run xdde setup system, then retry.")
            report("Pulling official compute image; Docker resumes completed layers on retry")
            execute(["docker", "pull", "aurekaresearch/opendde-harness:v1"], timeout=7200)
            inspection = execute(
                ["docker", "image", "inspect", "aurekaresearch/opendde-harness:v1"]
            )
            target = work / "image.json"
            target.write_text(inspection)
            return native("image", target)
        report("Preparing official, checksum-verified model resources")
        executable = Path(python).with_name("ddeharness")
        execute(
            [
                executable,
                "compute",
                "prepare",
                "--assets-only",
                "--mode",
                "local",
                "--root",
                root / "models/harness",
                "--opendde-root",
                root / "models/opendde",
                "--checkpoint",
                "opendde_abag.pt" if package == "abag" else "opendde.pt",
            ],
            timeout=43200,
        )
        return {"models": str(root / "models")}


OPENDDE: EnvironmentProvisioner = OpenDDEProvisioner()


def provisioning_origin(package: str, operation: str) -> dict:
    native = package in OPEN_PACKAGES
    return {
        "engine": "opendde" if native else "x-dde",
        "implementation": "OpenDDE Harness installer" if native else "X-DDE reviewed recipe",
        "version": PACKAGES["harness"].version if native else PACKAGES[package].version,
        "deployment_operation": operation,
    }


def states(installed: dict) -> dict:
    return {"opendde": OPENDDE.status(installed)}
