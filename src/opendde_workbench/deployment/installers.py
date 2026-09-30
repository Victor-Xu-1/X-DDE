"""Fixed release recipes; all paths stay inside the owned deployment root."""

import json
import shutil
import sys
from pathlib import Path
from uuid import uuid4

from .catalog import PACKAGES
from .process import run
from .transfers import download, extract

CONSTRAINTS = "https://github.com/aurekaresearch/OpenDDE-Harness/releases/download/v0.0.4/opendde-harness-constraints.txt"
CONSTRAINTS_SHA = "2659c7b3fc403f165799f3ed9b66b2cd7d9bd2b18b6982c38a86e8f8e74b509b"


def install(key, root, installed, operation, report, checkpoint):
    spec = PACKAGES[key]
    work = root / "operations" / operation
    work.mkdir(parents=True, exist_ok=True)

    def execute(args, timeout=3600):
        checkpoint()
        return run([str(v) for v in args], work, checkpoint, report, timeout=timeout)

    def native(action, target):
        python = installed["harness"]["python"]
        text = execute([python, Path(__file__).with_name("native_setup.py"), action, target])
        result = next(
            (line[17:] for line in text.splitlines() if line.startswith("WORKBENCH_RESULT=")), None
        )
        if result is None:
            raise RuntimeError("Native installer did not return a verified result.")
        return json.loads(result)

    metadata = {"version": spec.version}
    report("Preparing verified release")
    if key in {"ketcher", "molstar", "harness"}:
        archive = root / "downloads" / spec.url.rsplit("/", 1)[1]
        download(spec.url, archive, spec.checksum, report, checkpoint)
        # Each attempt has a separate staging area, never overwrites an active release.
        destination = root / "packages" / key / (spec.version + "-" + str(uuid4()))
        destination.mkdir(parents=True)
        metadata["directory"] = str(destination)
        if key == "harness":
            constraints = root / "downloads" / "harness-constraints-0.0.4.txt"
            download(CONSTRAINTS, constraints, CONSTRAINTS_SHA, report, checkpoint)
            uv = shutil.which("uv")
            if not uv:
                raise RuntimeError(
                    "uv is missing. Re-run the Workbench installer to install its prerequisites."
                )
            report("Installing native Harness in an isolated environment")
            execute([uv, "venv", "--python", sys.executable, destination / "venv"])
            python = destination / "venv/bin/python"
            execute(
                [uv, "pip", "install", "--python", python, "--constraint", constraints, archive]
            )
            execute([python, "-c", "import opendde_harness.cli.commands"])
            metadata["python"] = str(python)
        else:
            report("Extracting and verifying editor files")
            extract(archive, destination, checkpoint)
            if key == "molstar":
                web = destination / "package/build/viewer"
                required = [web / "molstar.js", web / "molstar.css"]
            else:
                candidates = [
                    p.parent
                    for p in destination.rglob("index.html")
                    if "node_modules" not in p.parts
                ]
                if len(candidates) != 1:
                    raise RuntimeError("Unexpected Ketcher distribution layout.")
                web = candidates[0]
                required = [web / "index.html"]
            if not all(p.is_file() for p in required):
                raise RuntimeError("Editor distribution is incomplete.")
            metadata["web"] = str(web)
    elif key == "runtime":
        report("Preparing official OpenDDE, PLIP and MPNN sources")
        metadata.update(native("code", root / "code"))
    elif key == "compute":
        if not shutil.which("docker"):
            raise RuntimeError(
                "Docker is missing. Run opendde setup system in the terminal, then retry."
            )
        report("Pulling official compute image; Docker resumes completed layers on retry")
        execute(["docker", "pull", "aurekaresearch/opendde-harness:v1"], timeout=7200)
        inspection = execute(["docker", "image", "inspect", "aurekaresearch/opendde-harness:v1"])
        image_file = work / "image.json"
        image_file.write_text(inspection)
        metadata.update(native("image", image_file))
    elif key in {"standard", "abag"}:
        report("Preparing official, checksum-verified model resources")
        executable = Path(installed["harness"]["python"]).with_name("ddeharness")
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
                "opendde_abag.pt" if key == "abag" else "opendde.pt",
            ],
            timeout=43200,
        )
        metadata["models"] = str(root / "models")
    else:
        raise ValueError("Unknown installer recipe")
    checkpoint()
    return metadata
