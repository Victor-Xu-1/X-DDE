"""Reviewed endpoint and model identities; no model downloads at task execution time."""

import hashlib
import json
from pathlib import Path

METADATA_BYTES = Path(__file__).with_name("metadata.json").read_bytes()
METADATA = json.loads(METADATA_BYTES)
METADATA_DIGEST = hashlib.sha256(METADATA_BYTES).hexdigest()
ENDPOINTS = tuple(item["id"] for item in METADATA["endpoints"])
CLASSIFICATION = frozenset(
    item["id"] for item in METADATA["endpoints"] if item["task_type"] == "classification"
)
VERSIONS = {
    "admet-ai": "2.0.1",
    "chemprop": "2.3.1",
    "torch": "2.8.0+cpu",
    "rdkit": "2026.3.6",
    "numpy": "2.2.6",
    "pandas": "2.3.3",
    "lightning": "2.6.1",
}
LEGACY_VERSIONS = {**VERSIONS, "chemprop": "2.2.2", "rdkit": "2025.9.5"}
MAX_RECORDS = 50
MAX_HEAVY_ATOMS = 256
MAX_INPUT_BYTES = 8 * 1024**2
