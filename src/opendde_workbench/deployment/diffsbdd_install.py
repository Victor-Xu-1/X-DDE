"""Reviewed native source/environment recipe; model downloads are separate choices."""

import hashlib
import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

from ..diffsbdd.manifest import (
    MODEL_URL,
    MODELS,
    PYTHON_VERSION,
    SOURCE_COMMIT,
    SOURCE_SHA256,
    SOURCE_URL,
    UPSTREAM_COMMIT,
    UPSTREAM_URL,
)
from .paths import environment_root
from .process import run
from .transfers import download, extract

NATIVE_MODULES = (
    "__init__",
    "config",
    "components",
    "contracts",
    "options",
    "registry",
    "runtime",
    "inputs",
    "pockets",
    "preparation",
    "results",
    "sampling",
    "generation",
    "optimization",
    "editing",
    "interactions",
)


def install_runtime(root, work, report, checkpoint):
    uv = shutil.which("uv")
    if not uv or not shutil.which("git"):
        raise RuntimeError("Install uv and Git before deploying DiffSBDD.")
    archive = root / "downloads" / ("diffsbdd-" + SOURCE_COMMIT + ".tar.gz")
    download(SOURCE_URL, archive, SOURCE_SHA256, report, checkpoint)
    staging = work / ("source-" + str(uuid4()))
    extract(archive, staging, checkpoint)
    package = staging / ("diffsbdd-workbench-" + SOURCE_COMMIT)
    destination = environment_root(root, "diffsbdd") / (SOURCE_COMMIT[:12] + "-" + str(uuid4()))
    native = destination / "native"
    native.mkdir(parents=True)
    (native / "local_diffsbdd").mkdir()
    for module in NATIVE_MODULES:
        shutil.copyfile(
            package / "local_diffsbdd" / (module + ".py"),
            native / "local_diffsbdd" / (module + ".py"),
        )
    shutil.copytree(package / "local_diffsbdd/data", native / "local_diffsbdd/data")
    for file in (
        "requirements.lock",
        "models.json",
        "LICENSE",
        "UPSTREAM-LICENSE",
        "THIRD_PARTY_NOTICES",
    ):
        shutil.copyfile(package / file, native / file)
    shutil.copytree(package / "patches", native / "patches")
    runtime = root / "backends/diffsbdd"
    runtime.mkdir(parents=True, exist_ok=True)
    (runtime / "models").mkdir(exist_ok=True)
    env = {
        **os.environ,
        "UV_CACHE_DIR": str(root / "cache/uv"),
        "UV_CONCURRENT_DOWNLOADS": "2",
        "UV_CONCURRENT_INSTALLS": "2",
    }

    def execute(args, timeout=3600):
        return run([str(arg) for arg in args], work, checkpoint, report, timeout=timeout, env=env)

    source = runtime / "source"
    if not source.exists():
        execute(["git", "clone", "--filter=blob:none", "--no-checkout", UPSTREAM_URL, source])
        execute(["git", "-C", source, "sparse-checkout", "init", "--no-cone"])
        execute(
            ["git", "-C", source, "sparse-checkout", "set", "--no-cone", "/*", "!/img/", "!/colab/"]
        )
        execute(["git", "-C", source, "checkout", "--detach", UPSTREAM_COMMIT])
        execute(["git", "-C", source, "apply", native / "patches/upstream.patch"])
    head = execute(["git", "-C", source, "rev-parse", "HEAD"]).strip()
    diff = execute(["git", "-C", source, "diff", "--no-ext-diff", "HEAD", "--"])
    if head != UPSTREAM_COMMIT or diff != (native / "patches/upstream.patch").read_text():
        raise ValueError("Existing DiffSBDD upstream code is not the reviewed revision and patch.")
    report("Installing isolated DiffSBDD Python 3.10 / CUDA dependencies; no model inference")
    execute([uv, "venv", "--python", PYTHON_VERSION, destination / "venv"])
    python = destination / "venv/bin/python"
    execute(
        [
            uv,
            "pip",
            "sync",
            native / "requirements.lock",
            "--require-hashes",
            "--link-mode",
            "copy",
            "--python",
            python,
            "--extra-index-url",
            "https://download.pytorch.org/whl/cu128",
            "--find-links",
            "https://data.pyg.org/whl/torch-2.7.0+cu128.html",
            "--index-strategy",
            "unsafe-best-match",
        ],
        timeout=7200,
    )
    execute([uv, "pip", "check", "--python", python])
    hashes = {
        p.relative_to(native).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in native.rglob("*")
        if p.is_file()
    }
    manifest = native / "xdde-native-manifest.json"
    manifest.write_text(
        json.dumps(
            {"source_commit": SOURCE_COMMIT, "upstream_commit": UPSTREAM_COMMIT, "files": hashes},
            sort_keys=True,
        )
    )
    checkpoint()
    return {
        "directory": str(destination),
        "python": str(python),
        "source": str(native),
        "runtime": str(runtime),
        "manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
        "source_commit": SOURCE_COMMIT,
        "upstream_commit": UPSTREAM_COMMIT,
    }


def install_model(key, root, installed, report, checkpoint):
    spec = MODELS[key.removeprefix("diffsbdd-model-")]
    runtime = Path(installed["diffsbdd"]["runtime"])
    if runtime.resolve() != (root / "backends/diffsbdd").resolve():
        raise ValueError("Model destination is outside the managed DiffSBDD runtime.")
    target = runtime / "models" / spec["file"]
    download(MODEL_URL + spec["file"] + "?download=1", target, spec["sha256"], report, checkpoint)
    if target.stat().st_size != spec["bytes"]:
        raise ValueError("Model checkpoint size does not match the official release.")
    return {"models": str(target.parent), "file": spec["file"], "sha256": spec["sha256"]}
