"""Reproducible isolated images from reviewed source and native dependency locks."""

import hashlib
import shutil
from pathlib import Path

from .specs import PROGRAMS, recipe_digest


def lock_digest(identifier):
    root = Path(__file__).parent / "recipes"
    files = [root / (identifier + suffix) for suffix in (".txt", ".conda.txt")]
    hasher = hashlib.sha256()
    for file in files:
        if file.is_file():
            hasher.update(file.name.encode())
            hasher.update(file.read_bytes())
    return hasher.hexdigest()


def prepare_context(identifier, destination, source=None):
    spec = PROGRAMS[identifier]
    destination.mkdir(parents=True, exist_ok=True)
    recipes = Path(__file__).parent / "recipes"
    lines = ["FROM " + spec["base"], "USER root"]
    if spec.get("conda"):
        locked = recipes / (identifier + ".conda.txt")
        if not locked.is_file():
            raise ValueError("The reviewed native conda lock is missing.")
        shutil.copyfile(locked, destination / "conda-explicit.txt")
        lines += [
            "COPY conda-explicit.txt /tmp/conda-explicit.txt",
            "RUN micromamba install -y -n base --file /tmp/conda-explicit.txt "
            "&& micromamba clean --all --yes",
            "ENV PATH=/opt/conda/bin:$PATH",
        ]
    if spec["pip"]:
        locked = recipes / (identifier + ".txt")
        if not locked.is_file():
            raise ValueError("The reviewed native pip lock is missing.")
        shutil.copyfile(locked, destination / "requirements.txt")
        lines += [
            "COPY requirements.txt /tmp/requirements.txt",
            "RUN python -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt "
            "&& python -m pip check",
        ]
    if source:
        # Source has already passed the fixed archive checksum and member checks.
        shutil.copytree(source, destination / "source")
        lines += ["COPY source /opt/native"]
        if spec.get("source", {}).get("package"):
            lines += ["RUN python -m pip install --no-deps /opt/native && python -m pip check"]
    lines += [
        'LABEL org.xdde.science.program="' + identifier + '" '
        'org.xdde.science.recipe="' + recipe_digest(identifier) + '" '
        'org.xdde.science.lock="' + lock_digest(identifier) + '"',
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1",
        "WORKDIR /output",
    ]
    (destination / "Dockerfile").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
