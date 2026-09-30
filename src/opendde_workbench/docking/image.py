"""One reviewed image recipe, reused by managed installation and native CI."""

import hashlib
import shutil
from pathlib import Path

from .manifest import BINARY_SHA256, PYTHON_IMAGE, VERSION


def lock_digest():
    return hashlib.sha256(
        Path(__file__).with_name("native-requirements.txt").read_bytes()
    ).hexdigest()


def prepare_context(destination, binary, licenses):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(binary, destination / "gnina")
    shutil.copyfile(
        Path(__file__).with_name("native-requirements.txt"), destination / "requirements.txt"
    )
    for name, file in licenses.items():
        shutil.copyfile(file, destination / name)
    (destination / "Dockerfile").write_text(
        "FROM " + PYTHON_IMAGE + "\n"
        "COPY requirements.txt /tmp/requirements.txt\n"
        "RUN python -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt "
        "&& python -m pip check && rm /tmp/requirements.txt\n"
        "COPY gnina LICENSE.APACHE LICENSE.GNU /opt/gnina/\n"
        "RUN chmod 0555 /opt/gnina/gnina\n"
        'LABEL org.xdde.gnina.version="' + VERSION + '" '
        'org.xdde.gnina.sha256="' + BINARY_SHA256 + '" '
        'org.xdde.gnina.runtime-lock="' + lock_digest() + '"\n'
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\n"
        "ENV LD_LIBRARY_PATH=/usr/local/lib/python3.10/site-packages/nvidia/cudnn/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cublas/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cuda_runtime/lib:"
        "/usr/local/nvidia/lib:/usr/local/nvidia/lib64\n"
        "RUN ldd /opt/gnina/gnina > /opt/gnina/linker-report.txt "
        "&& ! grep -q 'not found' /opt/gnina/linker-report.txt\n"
        "WORKDIR /output\n"
    )
