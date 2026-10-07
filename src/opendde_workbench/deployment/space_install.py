"""Verified stable channel software; installation never computes on user structures."""

import re
import shutil
from uuid import uuid4

from ..space.image import lock_digest, prepare_context
from ..space.manifest import SHA256, URL, VERSION
from .paths import environment_root
from .transfers import download, extract


def install_space(root, work, execute, report, checkpoint):
    if not shutil.which("docker"):
        raise RuntimeError("Install the server Docker prerequisites first.")
    if shutil.disk_usage(root).free < 3 * 1024**3:
        raise ValueError("Channel installation needs at least 3 GiB free staging/image space.")
    destination = environment_root(root, "caver") / (VERSION + "-" + str(uuid4()))
    destination.mkdir(parents=True, exist_ok=False)
    archive = root / "downloads" / ("caver-" + VERSION + ".zip")
    download(URL, archive, SHA256, report, checkpoint)
    unpacked = destination / "upstream"
    extract(archive, unpacked, checkpoint)
    jars = list(unpacked.glob("caver_3.0/caver/caver.jar"))
    if len(jars) != 1:
        raise ValueError("The reviewed channel distribution has an unexpected layout.")
    context = destination / "image-context"
    prepare_context(context, jars[0].parent)
    checkpoint()
    report(
        "Building independent native channel environment "
        "with reviewed Java and structural dependencies"
    )
    tag = "xdde-caver:" + VERSION + "-" + lock_digest()[:12]
    execute(["docker", "build", "--pull", "--tag", tag, context], timeout=3600)
    image = execute(["docker", "image", "inspect", "--format", "{{.Id}}", tag]).strip()
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", image):
        raise ValueError("The channel build did not return an immutable image identity.")
    return {
        "directory": str(destination),
        "image": image,
        "runtime_lock_sha256": lock_digest(),
        "source_sha256": SHA256,
    }
