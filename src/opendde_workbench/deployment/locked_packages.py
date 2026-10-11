"""Fetch immutable archives on the host; image installation needs no build network."""

import json
import re
import urllib.request
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from .transfers import download


def archive_name(url, host):
    parsed = urlsplit(url)
    name = PurePosixPath(parsed.path).name
    if (
        parsed.scheme != "https"
        or parsed.hostname != host
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or not re.fullmatch(r"[A-Za-z0-9._+-]+", name)
    ):
        raise ValueError("Dependency archive is outside its reviewed registry.")
    return name


def fetch(url, digest, cache, host, report, checkpoint):
    name = archive_name(url, host)
    if not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("Dependency archive requires an exact SHA256 identity.")
    file = cache / digest / name
    report("Preparing scientific dependencies")
    download(url, file, digest, report, checkpoint, limit=1024**3)
    return {"file": file, "sha256": digest, "url": url}


def dependency_progress(report, index, count):
    return lambda message: report(f"Dependencies {index}/{count}: " + message)


def conda_archives(lock, cache, report, checkpoint):
    lines = [line.strip() for line in lock.read_text().splitlines() if line.strip()]
    if not lines or lines[0] != "@EXPLICIT" or len(lines) > 1501:
        raise ValueError("Native conda packages require a bounded explicit lock.")
    entries = []
    for index, line in enumerate(lines[1:], 1):
        url, separator, digest = line.rpartition("#")
        if not separator or not url.startswith("https://conda.anaconda.org/conda-forge/"):
            raise ValueError("Native conda package lacks a reviewed channel or checksum.")
        progress = dependency_progress(report, index, len(lines) - 1)
        entries.append(fetch(url, digest, cache, "conda.anaconda.org", progress, checkpoint))
    return entries


def requirements(lock):
    pieces, entries = [], []
    for line in lock.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        continued = line.endswith("\\")
        pieces.append(line.removesuffix("\\").strip())
        if continued:
            continue
        tokens = " ".join(pieces).split()
        pieces.clear()
        match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+]+)", tokens[0])
        hashes = [re.fullmatch(r"--hash=sha256:([a-f0-9]{64})", token) for token in tokens[1:]]
        if not match or not hashes or not all(hashes):
            raise ValueError("Native wheels require exact versions and SHA256 hashes only.")
        entries.append((match[1], match[2], {value[1] for value in hashes}))
    if pieces or not 1 <= len(entries) <= 100:
        raise ValueError("Native wheel lock is incomplete or exceeds its package budget.")
    return entries


def compatible_wheel(filename):
    if not filename.endswith(".whl"):
        return False
    parts = filename[:-4].split("-")
    if len(parts) not in {5, 6}:
        return False
    python, abi, platform = parts[-3:]
    python_tags = python.split(".")
    compatible_python = "cp310" in python_tags or any(
        tag in {"py3", "py310"} for tag in python_tags
    )
    if abi == "abi3":
        compatible_python |= any(
            (match := re.fullmatch(r"cp3(\d+)", tag)) and 2 <= int(match[1]) <= 10
            for tag in python_tags
        )
    platforms = platform.split(".")
    compatible_platform = any(tag in {"any", "linux_x86_64"} for tag in platforms)
    for tag in platforms:
        if tag in {"manylinux1_x86_64", "manylinux2010_x86_64", "manylinux2014_x86_64"}:
            compatible_platform = True
        elif match := re.fullmatch(r"manylinux_2_(\d+)_x86_64", tag):
            compatible_platform |= int(match[1]) <= 36
    return compatible_python and abi in {"cp310", "abi3", "none"} and compatible_platform


def release_files(name, version):
    request = urllib.request.Request(
        f"https://pypi.org/pypi/{name}/{version}/json", headers={"Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read(4 * 1024**2 + 1)
    if len(content) > 4 * 1024**2:
        raise ValueError("Dependency registry metadata exceeds its bounded size.")
    return json.loads(content)["urls"]


def wheel_archives(lock, cache, report, checkpoint):
    entries = []
    locked = requirements(lock)
    for index, (name, version, hashes) in enumerate(locked, 1):
        checkpoint()
        candidates = [
            entry
            for entry in release_files(name, version)
            if compatible_wheel(entry["filename"])
            and entry.get("digests", {}).get("sha256") in hashes
            and not entry.get("yanked")
        ]
        if not candidates:
            raise ValueError("No reviewed Python 3.10 Linux wheel for " + name + "==" + version)
        entry = sorted(candidates, key=lambda value: value["filename"])[0]
        if archive_name(entry["url"], "files.pythonhosted.org") != entry["filename"]:
            raise ValueError("Dependency registry filename differs from its archive URL.")
        progress = dependency_progress(report, index, len(locked))
        entries.append(
            fetch(
                entry["url"],
                entry["digests"]["sha256"],
                cache,
                "files.pythonhosted.org",
                progress,
                checkpoint,
            )
        )
    return entries
