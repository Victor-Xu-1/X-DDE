"""Pinned optional pocket environment. Installs never run scientific inference."""

import hashlib
import json
import shutil
from uuid import uuid4

from ..pockets.manifest import JAVA_IMAGE, SHA256, URL, VERSION
from .paths import environment_root
from .transfers import download, extract


def install_pockets(key, root, work, execute, report, checkpoint):
    if key == "p2rank-compute":
        if not shutil.which("docker"):
            raise RuntimeError("Install the WSL/server Docker prerequisites first.")
        report("Installing reviewed offline CPU Java image")
        execute(["docker", "pull", JAVA_IMAGE], timeout=7200)
        return {"image": JAVA_IMAGE}
    destination = environment_root(root, "p2rank") / (VERSION + "-" + str(uuid4()))
    destination.mkdir(parents=True)
    archive = root / "downloads" / "p2rank_2.5.1.tar.gz"
    download(URL, archive, SHA256, report, checkpoint)
    extract(archive, destination, checkpoint)
    jars = list(destination.glob("*/bin/p2rank.jar"))
    if len(jars) != 1:
        raise ValueError("The native distribution has an unexpected layout.")
    source = jars[0].parent.parent
    # OCI must find the writable cache mount target beneath the read-only software mount.
    (source / "cache").mkdir(exist_ok=True)
    files = {}
    for file in sorted(source.rglob("*")):
        checkpoint()
        if file.is_file():
            if file.is_symlink():
                raise ValueError("Native distribution links are not accepted.")
            with file.open("rb") as stream:
                files[file.relative_to(source).as_posix()] = hashlib.file_digest(
                    stream, "sha256"
                ).hexdigest()
    manifest = source / "xdde-native-manifest.json"
    manifest.write_text(
        json.dumps({"version": VERSION, "release_sha256": SHA256, "files": files}, sort_keys=True)
    )
    return {
        "directory": str(destination),
        "source": str(source),
        "manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
    }
