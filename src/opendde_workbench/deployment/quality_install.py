"""Install only the reviewed offline quality runtime; installation submits no molecules."""

import shutil
from uuid import uuid4

from ..quality.image import VERSION, lock_digest, prepare_context
from .paths import environment_root


def install_quality(root, work, execute, report, checkpoint):
    if not shutil.which("docker"):
        raise RuntimeError("Install Docker prerequisites first.")
    if shutil.disk_usage(root).free < 2 * 1024**3:
        raise ValueError("Quality CPU installation requires2 GiB free space.")
    destination = environment_root(root, "posebusters") / (VERSION + "-" + str(uuid4()))
    context = destination / "image-context"
    prepare_context(context)
    checkpoint()
    report("Building independent hash-locked PoseBusters quality environment")
    tag = "xdde-posebusters:" + VERSION + "-" + lock_digest()[:12]
    execute(["docker", "build", "--pull", "--tag", tag, context], timeout=3600)
    image = execute(["docker", "image", "inspect", "--format", "{{.Id}}", tag]).strip()
    if not image.startswith("sha256:") or len(image) != 71:
        raise ValueError("Quality build did not produce an immutable image ID.")
    return {"directory": str(destination), "image": image, "runtime_lock_sha256": lock_digest()}
