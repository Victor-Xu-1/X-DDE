"""Checksum-pinned compression tooling for native template/RNA databases."""

import hashlib
import os
import shutil

from .transfers import download, extract

VERSION = "1.5.7"
URL = "https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-1.5.7.tar.gz"
SHA256 = "eb33e51f49a15e023950cd7825ca74a4a2b43db8354825ac24fc1b7ee09e6fa3"


def install_tools(root, work, installed, execute, report, checkpoint):
    archive = work / "zstd.tar.gz"
    download(URL, archive, SHA256, report, checkpoint)
    source = work / "source"
    extract(archive, source, checkpoint)
    image = installed["compute"]["image"]
    report("Building verified Zstandard in the existing scientific image")
    execute(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--user",
            f"{os.getuid()}:{os.getgid()}",
            "--mount",
            f"type=bind,source={source},target=/source",
            "--entrypoint",
            "make",
            image,
            "-C",
            f"/source/zstd-{VERSION}/programs",
            "-j2",
            "zstd-release",
            "ZSTD_LEGACY_SUPPORT=0",
            "HAVE_ZLIB=0",
            "HAVE_LZMA=0",
            "HAVE_LZ4=0",
        ]
    )
    destination = root / "tools" / "opendde" / (VERSION + "-" + work.name) / "bin"
    destination.mkdir(parents=True, exist_ok=False)
    binary = destination / "zstd"
    shutil.copyfile(source / f"zstd-{VERSION}" / "programs" / "zstd", binary)
    shutil.copyfile(source / f"zstd-{VERSION}" / "LICENSE", destination.parent / "LICENSE")
    binary.chmod(0o755)
    execute(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--mount",
            f"type=bind,source={destination},target=/tools,readonly",
            "--entrypoint",
            "/tools/zstd",
            image,
            "--version",
        ]
    )
    return {
        "directory": str(destination.parent),
        "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
        "source_sha256": SHA256,
        "version": VERSION,
    }
