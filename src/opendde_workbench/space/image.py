"""Reuse the structural dependency lock, with a distinct managed Java/native image."""

import hashlib
import json
import shutil
from pathlib import Path

from ..receptors.image import PYTHON_IMAGE
from .manifest import JAR_SHA256, JAVA_IMAGE, SHA256, VERSION

LOCK = Path(__file__).parent.parent / "receptors" / "native-requirements.txt"


def lock_digest():
    return hashlib.sha256(
        json.dumps(
            {
                "python": PYTHON_IMAGE,
                "java": JAVA_IMAGE,
                "source": SHA256,
                "jar": JAR_SHA256,
                "structural_lock": hashlib.sha256(LOCK.read_bytes()).hexdigest(),
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()


def labels_match(value):
    return (
        value.get("org.xdde.caver.version") == VERSION
        and value.get("org.xdde.caver.runtime-lock") == lock_digest()
    )


def prepare_context(destination, source):
    with (source / "caver.jar").open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != JAR_SHA256:
            raise ValueError("Native CAVER binary differs from the reviewed archive.")
    if source.is_symlink() or any(path.is_symlink() for path in source.rglob("*")):
        raise ValueError("Native CAVER source tree cannot contain symlinks.")
    destination.mkdir(parents=True, exist_ok=False)
    copied = destination / "caver"
    shutil.copytree(source, copied)
    # Safe archive staging is private; public native files must be readable by the
    # non-root worker inside the subsequently read-only image.
    for file in copied.rglob("*"):
        file.chmod(0o555 if file.is_dir() else 0o444)
    copied.chmod(0o555)
    shutil.copyfile(LOCK, destination / "requirements.txt")
    (destination / "Dockerfile").write_text(
        "FROM " + JAVA_IMAGE + " AS java\nFROM " + PYTHON_IMAGE + "\n"
        "COPY --from=java /opt/java/openjdk /opt/java/openjdk\n"
        "ENV JAVA_HOME=/opt/java/openjdk\n"
        "ENV PATH=/opt/java/openjdk/bin:$PATH\n"
        "RUN java -version\n"
        "COPY requirements.txt /tmp/requirements.txt\n"
        "RUN python -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt "
        "&& python -m pip check && rm /tmp/requirements.txt\n"
        "COPY caver /opt/caver\n"
        'LABEL org.xdde.caver.version="' + VERSION + '" '
        'org.xdde.caver.runtime-lock="' + lock_digest() + '"\n'
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\nWORKDIR /output\n",
        encoding="utf-8",
        newline="\n",
    )
