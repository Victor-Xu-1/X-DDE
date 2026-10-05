"""Independent structural environment; image construction is not scientific acceptance."""

import hashlib
import shutil
from pathlib import Path

PYTHON_IMAGE = (
    "docker.io/library/python@sha256:"
    "54b4fc9408ea4f5d1b1b9c63c7ef1968d46d3b927e00df8ab1f09364593f979f"
)
VERSION = "biopython-1.88-numpy-1.26.4"


def lock_digest():
    return hashlib.sha256(
        Path(__file__).with_name("native-requirements.txt").read_bytes()
    ).hexdigest()


def labels_match(value):
    return (
        value.get("org.xdde.biopython.version") == VERSION
        and value.get("org.xdde.biopython.runtime-lock") == lock_digest()
    )


def prepare_context(destination):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        Path(__file__).with_name("native-requirements.txt"), destination / "requirements.txt"
    )
    (destination / "Dockerfile").write_text(
        "FROM " + PYTHON_IMAGE + "\nCOPY requirements.txt /tmp/requirements.txt\n"
        "RUN python -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt "
        "&& python -m pip check && rm /tmp/requirements.txt\n"
        'LABEL org.xdde.biopython.version="'
        + VERSION
        + '" org.xdde.biopython.runtime-lock="'
        + lock_digest()
        + '"\n'
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\nWORKDIR /output\n",
        encoding="utf-8",
        newline="\n",
    )
