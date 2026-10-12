"""One reviewed image recipe, reused by managed installation and native CI."""

import hashlib
import shutil
from pathlib import Path

from ..integrations.offline_context import stage_archives
from .manifest import BINARY_SHA256, PYTHON_IMAGE, VERSION


def lock_digest():
    return hashlib.sha256(
        Path(__file__).with_name("native-requirements.txt").read_bytes()
    ).hexdigest()


def prepare_context(destination, binary, licenses, *, archives):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(binary, destination / "gnina")
    shutil.copyfile(
        Path(__file__).with_name("native-requirements.txt"), destination / "requirements.txt"
    )
    for name, file in licenses.items():
        shutil.copyfile(file, destination / name)
    stage_archives(archives, destination / "wheels")
    (destination / "Dockerfile").write_text(
        "FROM " + PYTHON_IMAGE + "\n"
        "COPY requirements.txt /tmp/requirements.txt\n"
        "RUN --mount=type=bind,source=wheels,target=/wheels,readonly "
        "python -m pip install --no-index --find-links=/wheels --no-cache-dir "
        "--require-hashes -r /tmp/requirements.txt "
        "&& python -m pip check && rm /tmp/requirements.txt\n"
        "COPY --chmod=0555 gnina /opt/gnina/gnina\n"
        "COPY LICENSE.APACHE LICENSE.GNU /opt/gnina/\n"
        'LABEL org.xdde.gnina.version="' + VERSION + '" '
        'org.xdde.gnina.sha256="' + BINARY_SHA256 + '" '
        'org.xdde.gnina.runtime-lock="' + lock_digest() + '"\n'
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\n"
        "ENV LD_LIBRARY_PATH=/usr/local/lib/python3.10/site-packages/nvidia/cudnn/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cublas/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cuda_runtime/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cuda_nvrtc/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cusparse/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cufft/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/cusolver/lib:"
        "/usr/local/lib/python3.10/site-packages/nvidia/nvjitlink/lib:"
        "/usr/local/nvidia/lib:/usr/local/nvidia/lib64\n"
        "RUN ldd /opt/gnina/gnina | tee /opt/gnina/linker-report.txt "
        "&& ! grep -q 'not found' /opt/gnina/linker-report.txt\n"
        # Torch loads NVRTC lazily during GPU scoring after the docking search;
        # ldd on the static executable cannot verify that runtime dependency.
        'RUN python -c "import ctypes; from pathlib import Path; '
        "library=ctypes.CDLL('libnvrtc.so.12'); "
        "major=ctypes.c_int(); minor=ctypes.c_int(); "
        "assert library.nvrtcVersion(ctypes.byref(major),ctypes.byref(minor)) == 0; "
        "assert (major.value,minor.value) == (12,8); "
        "assert list(Path('/usr/local/lib/python3.10/site-packages/nvidia/cuda_nvrtc/lib')"
        ".glob('libnvrtc-builtins.so*'))\"\n"
        "WORKDIR /output\n"
    )
