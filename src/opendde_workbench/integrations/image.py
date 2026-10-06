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


def prepare_context(identifier, destination, source=None, *, extra_sources=None):
    spec = PROGRAMS[identifier]
    destination.mkdir(parents=True, exist_ok=True)
    recipes = Path(__file__).parent / "recipes"
    lines = ["FROM " + spec["base"], "USER root"]
    if spec.get("system_packages"):
        lines += [
            "RUN apt-get update && apt-get install -y --no-install-recommends "
            + " ".join(spec["system_packages"])
            + " && rm -rf /var/lib/apt/lists/*"
        ]
    if spec.get("conda"):
        locked = recipes / (identifier + ".conda.txt")
        if not locked.is_file():
            raise ValueError("The reviewed native conda lock is missing.")
        shutil.copyfile(locked, destination / "conda-explicit.txt")
        lines += [
            "COPY conda-explicit.txt /tmp/conda-explicit.txt",
            # The AmberTools archive legitimately includes an amber.conda link.
            # micromamba 2.9's recursive tarball cleaner mistakes it for an
            # archive. Delete only this fresh image's package cache after a
            # successful transaction; installed environment files are retained.
            "RUN micromamba install -y -n base --file /tmp/conda-explicit.txt "
            "&& micromamba clean --index-cache --yes && rm -rf /opt/conda/pkgs",
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
        for patch in spec.get("source", {}).get("patches", []):
            relative = Path(patch["file"])
            file = destination / "source" / relative
            if relative.is_absolute() or ".." in relative.parts or file.is_symlink():
                raise ValueError("A reviewed native source patch has an unsafe path.")
            content = file.read_text(encoding="utf-8")
            if content.count(patch["old"]) != 1:
                raise ValueError(
                    "Reviewed native source differs from the exact compatibility patch."
                )
            file.write_text(content.replace(patch["old"], patch["new"]), encoding="utf-8")
        target = (
            "/opt/native/" + spec["source"]["prefix"]
            if spec.get("source", {}).get("package")
            else "/opt/native"
        )
        lines += ["COPY source " + target]
        if spec.get("source", {}).get("runtime_access") == "readonly_all_users":
            # Verified downloads are private staging files (0600). Container execution
            # uses the owning task's UID, so native resources must be readable there.
            lines += ["RUN chmod -R a+rX " + target]
        if spec.get("source", {}).get("package"):
            lines += [
                "RUN python -m pip install --no-deps --no-build-isolation " + target + " "
                "&& python -m pip check"
            ]
    for entry in spec.get("source_dependencies", []):
        dependency = (extra_sources or {}).get(entry["id"])
        if dependency is None or dependency.is_symlink():
            raise ValueError("A checksum-reviewed native source dependency is missing.")
        name = entry["id"]
        if not name.isidentifier():
            raise ValueError("A reviewed source dependency has an invalid identity.")
        shutil.copytree(dependency, destination / ("dependency-" + name))
        target = "/opt/native-dependencies/" + name
        lines += ["COPY dependency-" + name + " " + target]
        if entry.get("package"):
            lines += [
                "RUN python -m pip install --no-deps --no-build-isolation "
                + target
                + " && python -m pip check"
            ]
    if spec.get("source", {}).get("python_path"):
        lines += ["ENV PYTHONPATH=/opt/native"]
    lines += [
        'LABEL org.xdde.science.program="' + identifier + '" '
        'org.xdde.science.recipe="' + recipe_digest(identifier) + '" '
        'org.xdde.science.lock="' + lock_digest(identifier) + '"',
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1",
        "WORKDIR /output",
    ]
    (destination / "Dockerfile").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
