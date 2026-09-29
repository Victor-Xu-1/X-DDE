"""Record the actual immutable image and external source used for one task."""

import hashlib
import json

from . import __version__


def write_provenance(directory, image, code, invocation):
    source_files = ["runner/batch_inference.py", "opendde/data/inference/json_to_feature.py"]
    hashes = {
        name: hashlib.sha256((code / "external/opendde" / name).read_bytes()).hexdigest()
        for name in source_files
    }
    (directory / "output/runtime.json").write_text(
        json.dumps(
            {
                "workbench_version": __version__,
                "image": image,
                "source_sha256": hashes,
                "command": invocation,
                "checkpoint_note": "Record checkpoint SHA-256 during server acceptance; "
                "custom weights are operator-managed.",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
