"""Optional reviewed scientific runtime; installation never invokes GNINA inference."""

import shutil
from uuid import uuid4

from ..disk_space import available_bytes
from ..docking.image import lock_digest, prepare_context
from ..docking.manifest import (
    BINARY_BYTES,
    BINARY_SHA256,
    BINARY_URL,
    LICENSE_SHA256,
    LICENSES,
    VERSION,
)
from .locked_packages import wheel_archives
from .paths import environment_root
from .transfers import download


def install_docking(root, work, execute, report, checkpoint):
    if not shutil.which("docker"):
        raise RuntimeError("Install the server Docker prerequisites first.")
    if available_bytes(root) < 12 * 1024**3:
        raise ValueError("GNINA installation needs at least 12 GiB free staging/image space.")
    binary = root / "downloads" / "gnina-1.3.3.static"
    report("Downloading the checksum-verified GNINA executable")
    download(BINARY_URL, binary, BINARY_SHA256, report, checkpoint, limit=BINARY_BYTES + 1024**2)
    licenses = {}
    for name, url in LICENSES.items():
        file = root / "downloads" / name
        download(url, file, LICENSE_SHA256[name], report, checkpoint)
        licenses[name] = file
    destination = environment_root(root, "gnina") / (VERSION + "-" + str(uuid4()))
    context = destination / "image-context"
    from pathlib import Path

    import opendde_workbench.docking.image as image_recipe

    archives = wheel_archives(
        Path(image_recipe.__file__).with_name("native-requirements.txt"),
        root / "downloads" / "dependency-archives",
        report,
        checkpoint,
    )
    prepare_context(context, binary, licenses, archives=archives)
    checkpoint()
    report("Building isolated GNINA runtime with hash-locked dependencies")
    tag = "xdde-gnina:" + VERSION + "-" + lock_digest()[:12]
    execute(["docker", "build", "--network=none", "--pull", "--tag", tag, context], timeout=14400)
    image = execute(["docker", "image", "inspect", "--format", "{{.Id}}", tag]).strip()
    if not image.startswith("sha256:") or len(image) != 71:
        raise ValueError("Native image build did not return an immutable image ID.")
    return {
        "directory": str(destination),
        "image": image,
        "binary_sha256": BINARY_SHA256,
        "runtime_lock_sha256": lock_digest(),
    }
