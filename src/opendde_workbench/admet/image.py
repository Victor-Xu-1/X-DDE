"""Independent CPU recipe; bundled reference datasets are removed and never used."""

import hashlib
import shutil
from pathlib import Path

from .manifest import METADATA_DIGEST

PYTHON_IMAGE = (
    "docker.io/library/python@sha256:"
    "2986c55feb36e6cae00fa1fefb454283e4b33f35e75ff8bdd123b134130be301"
)
VERSION = "admet-ai-2.0.1-chemprop-2.3.1"


def lock_digest():
    return hashlib.sha256(
        Path(__file__).with_name("native-requirements.txt").read_bytes()
    ).hexdigest()


def labels_match(labels):
    return (
        labels.get("org.xdde.admet.version") == VERSION
        and labels.get("org.xdde.admet.runtime-lock") == lock_digest()
        and labels.get("org.xdde.admet.metadata") == METADATA_DIGEST
    )


def prepare_context(destination):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        Path(__file__).with_name("native-requirements.txt"), destination / "requirements.txt"
    )
    (destination / "Dockerfile").write_text(
        "FROM " + PYTHON_IMAGE + "\nCOPY requirements.txt /tmp/requirements.txt\n"
        "RUN python -m pip install --no-cache-dir --only-binary=:all: --require-hashes "
        "-r /tmp/requirements.txt && python -m pip check && "
        'python -c "import site; from pathlib import Path; '
        "(Path(site.getsitepackages()[0]) / 'admet_ai/resources/data/drugbank_approved.csv')"
        '.unlink(missing_ok=True)" && rm /tmp/requirements.txt\n'
        'LABEL org.xdde.admet.version="'
        + VERSION
        + '" org.xdde.admet.runtime-lock="'
        + lock_digest()
        + '" org.xdde.admet.metadata="'
        + METADATA_DIGEST
        + '"\n'
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MPLCONFIGDIR=/tmp/matplotlib\n"
        "WORKDIR /output\n",
        encoding="utf-8",
    )
