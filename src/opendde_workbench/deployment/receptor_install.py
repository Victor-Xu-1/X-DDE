"""Small independent environment; installation never aligns structures on user assets."""

import shutil
from uuid import uuid4

from ..receptors.image import VERSION, lock_digest, prepare_context
from .paths import environment_root


def install_biopython(root, work, execute, report, checkpoint):
    if not shutil.which("docker"):
        raise RuntimeError("Install the server Docker prerequisites first.")
    if shutil.disk_usage(root).free < 2 * 1024**3:
        raise ValueError("Biopython installation needs at least 2 GiB free staging/image space.")
    destination = environment_root(root, "biopython") / (VERSION + "-" + str(uuid4()))
    context = destination / "image-context"
    prepare_context(context)
    checkpoint()
    report("Building independent structural runtime with hash-locked dependencies")
    tag = "xdde-biopython:" + VERSION + "-" + lock_digest()[:12]
    execute(["docker", "build", "--pull", "--tag", tag, context], timeout=3600)
    image = execute(["docker", "image", "inspect", "--format", "{{.Id}}", tag]).strip()
    if not image.startswith("sha256:") or len(image) != 71:
        raise ValueError("Biopython build did not return an immutable image ID.")
    return {"directory": str(destination), "image": image, "runtime_lock_sha256": lock_digest()}
