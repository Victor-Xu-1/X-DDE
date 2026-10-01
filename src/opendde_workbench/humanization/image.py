"""Dedicated CPU image: fixed packages, official local safetensors and no network during tasks."""

import hashlib
import shutil
from pathlib import Path

from ..deployment.transfers import download
from .manifest import METADATA, METADATA_DIGEST

PYTHON_IMAGE = (
    "docker.io/library/python@sha256:"
    "2986c55feb36e6cae00fa1fefb454283e4b33f35e75ff8bdd123b134130be301"
)
VERSION = "sapiens-1.1.0-anarcii-2.0.8-promb-1.0.2"


def lock_digest():
    return hashlib.sha256(
        Path(__file__).with_name("native-requirements.txt").read_bytes()
    ).hexdigest()


def labels_match(labels):
    return (
        labels.get("org.xdde.sapiens.version") == VERSION
        and labels.get("org.xdde.sapiens.runtime-lock") == lock_digest()
        and labels.get("org.xdde.sapiens.models") == METADATA_DIGEST
    )


def prepare_context(destination, report, checkpoint):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        Path(__file__).with_name("native-requirements.txt"), destination / "requirements.txt"
    )
    for key, resource in METADATA["resources"].items():
        for name, identity in resource["files"].items():
            checkpoint()
            file = destination / "models" / key / name
            download(
                identity["url"],
                file,
                identity["sha256"],
                report,
                checkpoint,
                limit=identity["size"],
            )
            if file.stat().st_size != identity["size"]:
                raise ValueError("A Sapiens resource has an unexpected distribution size.")
    (destination / "Dockerfile").write_text(
        "FROM " + PYTHON_IMAGE + "\nCOPY requirements.txt /tmp/requirements.txt\n"
        "RUN python -m pip install --no-cache-dir --only-binary=:all: --require-hashes "
        "-r /tmp/requirements.txt && python -m pip check && "
        "python -c 'from pathlib import Path; "
        "from promb.db import HUMAN_REFERENCE_DB_PATH, HUMAN_SWISSPROT_DB_PATH; "
        "Path(HUMAN_REFERENCE_DB_PATH).unlink(missing_ok=True); "
        "Path(HUMAN_SWISSPROT_DB_PATH).unlink(missing_ok=True)' "
        "&& rm /tmp/requirements.txt\n"
        "COPY models /opt/xdde-sapiens/models\n"
        "RUN chmod -R a+rX /opt/xdde-sapiens/models\n"
        'LABEL org.xdde.sapiens.version="' + VERSION + '" '
        'org.xdde.sapiens.runtime-lock="' + lock_digest() + '" '
        'org.xdde.sapiens.models="' + METADATA_DIGEST + '"\n'
        "ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1 "
        "TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 TOKENIZERS_PARALLELISM=false\n"
        "WORKDIR /output\n",
        encoding="utf-8",
    )
