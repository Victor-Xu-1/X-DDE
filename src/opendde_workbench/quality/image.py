"""Fixed quality CPU image and complete hash-locked dependency graph."""

import hashlib
import shutil
from pathlib import Path

PYTHON_IMAGE = (
    "docker.io/library/python@sha256:"
    "2986c55feb36e6cae00fa1fefb454283e4b33f35e75ff8bdd123b134130be301"
)
VERSION = "posebusters-0.6.5-rdkit-2025.9.5"


def lock_digest():
    return hashlib.sha256(
        Path(__file__).with_name("native-requirements.txt").read_bytes()
    ).hexdigest()


def labels_match(labels):
    return (
        labels.get("org.xdde.posebusters.version") == VERSION
        and labels.get("org.xdde.posebusters.runtime-lock") == lock_digest()
    )


def prepare_context(destination):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        Path(__file__).with_name("native-requirements.txt"), destination / "requirements.txt"
    )
    (destination / "Dockerfile").write_text(
        "FROM " + PYTHON_IMAGE + "\nCOPY requirements.txt /tmp/requirements.txt\n"
        "RUN python -m pip install --no-cache-dir --only-binary=:all: "
        "--require-hashes -r /tmp/requirements.txt "
        "&& python -m pip check && rm /tmp/requirements.txt\n"
        'LABEL org.xdde.posebusters.version="'
        + VERSION
        + '" org.xdde.posebusters.runtime-lock="'
        + lock_digest()
        + '"\n'
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\nWORKDIR /output\n",
        encoding="utf-8",
    )
