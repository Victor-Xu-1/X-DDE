"""One fixed identity manifest for official models, runtime dependencies and peptide reference."""

import hashlib
import json
from pathlib import Path

METADATA_BYTES = Path(__file__).with_name("metadata.json").read_bytes()
METADATA = json.loads(METADATA_BYTES)
METADATA_DIGEST = hashlib.sha256(METADATA_BYTES).hexdigest()
MAX_RECORDS = 20
MAX_SEQUENCE_LENGTH = 200
VERSIONS = {
    "sapiens": "1.1.0",
    "anarcii": "2.0.8",
    "promb": "1.0.2",
    "torch": "2.8.0+cpu",
    "transformers": "4.57.6",
    "safetensors": "0.7.0",
    "numpy": "2.2.6",
    "pandas": "2.3.3",
    "scipy": "1.16.2",
}
