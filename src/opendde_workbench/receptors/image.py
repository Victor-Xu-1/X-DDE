"""Independent structural environment; image construction is not scientific acceptance."""

import hashlib
import shutil
from pathlib import Path

PYTHON_IMAGE = (
    "docker.io/library/python@sha256:"
    "54b4fc9408ea4f5d1b1b9c63c7ef1968d46d3b927e00df8ab1f09364593f979f"
)
VERSION = "biopython-1.88-dockq-2.1.3-numpy-1.26.4"


def lock_digest():
    return hashlib.sha256(
        Path(__file__).with_name("native-requirements.txt").read_bytes()
    ).hexdigest()


def build_lock_digest():
    return hashlib.sha256(
        (Path(__file__).parent / "build/native-requirements.txt").read_bytes()
    ).hexdigest()


def labels_match(value):
    return (
        value.get("org.xdde.biopython.version") == VERSION
        and value.get("org.xdde.biopython.runtime-lock") == lock_digest()
        and value.get("org.xdde.biopython.build-lock") == build_lock_digest()
    )


def prepare_context(destination):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        Path(__file__).with_name("native-requirements.txt"), destination / "requirements.txt"
    )
    shutil.copyfile(
        Path(__file__).parent / "build/native-requirements.txt",
        destination / "build-requirements.txt",
    )
    template = Path(__file__).with_name("native.Dockerfile").read_text()
    for key, value in {
        "PYTHON_IMAGE": PYTHON_IMAGE,
        "VERSION": VERSION,
        "RUNTIME_LOCK": lock_digest(),
        "BUILD_LOCK": build_lock_digest(),
    }.items():
        template = template.replace("@" + key + "@", value)
    (destination / "Dockerfile").write_text(template, encoding="utf-8", newline="\n")
