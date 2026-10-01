"""Install one independent environment without creating research tasks or another web service."""

import shutil
from uuid import uuid4

from ..humanization.image import VERSION, lock_digest, prepare_context
from .paths import environment_root


def install_humanization(root, work, execute, report, checkpoint):
    if not shutil.which("docker"):
        raise RuntimeError("Install Docker prerequisites first.")
    if shutil.disk_usage(root).free < 6 * 1024**3:
        raise ValueError("The independent Sapiens CPU environment requires 6 GiB staging space.")
    destination = environment_root(root, "sapiens") / (VERSION + "-" + str(uuid4()))
    context = destination / "image-context"
    prepare_context(context, report, checkpoint)
    checkpoint()
    report("Building independent Sapiens/ANARCII/Promb CPU environment")
    tag = "xdde-sapiens:" + VERSION + "-" + lock_digest()[:12]
    execute(["docker", "build", "--pull", "--tag", tag, context], timeout=3600)
    image = execute(["docker", "image", "inspect", "--format", "{{.Id}}", tag]).strip()
    if not image.startswith("sha256:") or len(image) != 71:
        raise ValueError("Humanization installation did not return an immutable image identity.")
    return {"directory": str(destination), "image": image, "runtime_lock_sha256": lock_digest()}
