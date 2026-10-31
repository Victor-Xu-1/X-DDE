"""Continue an interrupted native binder study through the existing job authority."""

import hashlib
import json
from pathlib import Path

from .native_binder_checkpoint import inventory
from .specs import recipe_digest


def checkpoint(state, store, identifier):
    if store.queue_halt():
        raise ValueError("Confirm native cleanup before continuing calculated stages.")
    parent = store.get(str(identifier))
    if parent is None or parent.status not in {"interrupted", "failed"}:
        raise ValueError("Choose a stopped interrupted or failed binder task.")
    if parent.request.operation != "boltzgen_design":
        raise ValueError("Only native binder calculations have these stage checkpoints.")
    directory = Path(state) / "jobs" / str(parent.id)
    if directory.is_symlink() or (directory / "output/result.json").exists():
        raise ValueError("A completed result cannot be resumed as an interrupted calculation.")
    for name in ("output", "output/native", "output/native/designs", "adapter", "request.json"):
        if (directory / name).is_symlink():
            raise ValueError("Binder checkpoint paths must remain inside the original task.")
    execution_file = directory / "boltzgen-execution.json"
    if execution_file.is_symlink() or execution_file.stat().st_size > 2 * 1024**2:
        raise ValueError("The original binder execution receipt is unsafe.")
    execution = json.loads(execution_file.read_text())
    request_file = directory / "request.json"
    if request_file.stat().st_size > 2 * 1024**2:
        raise ValueError("The original binder request exceeds its size boundary.")
    frozen = json.loads(request_file.read_text())
    if frozen != parent.request.model_dump(mode="json"):
        raise ValueError("Original binder request differs from its immutable task record.")
    for name in ("native_boltzgen.py", "native_resources.py", "recipes.json"):
        file = directory / "adapter" / name
        if (
            file.is_symlink()
            or file.stat().st_size > 2 * 1024**2
            or hashlib.sha256(file.read_bytes()).hexdigest() != execution["adapter_sha256"][name]
        ):
            raise ValueError("Original binder adapter provenance could not be verified.")
    recipes = json.loads((directory / "adapter/recipes.json").read_text())["programs"]
    recipe = hashlib.sha256(
        json.dumps(recipes["boltzgen"], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if recipe != recipe_digest("boltzgen"):
        raise ValueError("The original binder model recipe differs from this environment.")
    files = inventory(directory / "output/native/designs", parent.request.payload.candidates)
    manifest = {
        "schema": 1,
        "job_id": str(parent.id),
        "request_sha256": hashlib.sha256(
            json.dumps(frozen, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "image": execution["image"],
        "recipe_sha256": recipe,
        "files": files,
    }
    return parent, directory, manifest


def describe(state, store, identifier):
    parent, _, manifest = checkpoint(state, store, identifier)
    sha = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    folders = {
        "generated": "intermediate_designs/",
        "inverse_folded": "intermediate_designs_inverse_folded/",
        "complex_refolded": "intermediate_designs_inverse_folded/refold_cif/",
        "binder_refolded": "intermediate_designs_inverse_folded/refold_design_cif/",
    }
    counts = {
        key: sum(
            name.startswith(prefix) and "/" not in name[len(prefix) :] and name.endswith(".cif")
            for name in manifest["files"]
        )
        for key, prefix in folders.items()
    }
    return {"job_id": str(parent.id), "sha256": sha, "counts": counts}


def validate_continuation(request, state, store):
    selected = request.payload.continuation
    if selected is None:
        return None
    parent, directory, manifest = checkpoint(state, store, selected.job_id)
    digest = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if selected.sha256 != digest:
        raise ValueError("The original binder stage files changed after inspection.")
    original = parent.request.model_dump(mode="json")
    current = request.model_dump(mode="json")
    # The original design, exact inputs, seed metadata and resource budget stay
    # fixed. A continuation has its own name and explicit checkpoint reference.
    current["payload"].pop("continuation", None)
    original["payload"].pop("continuation", None)
    current["name"] = original["name"]
    if current != original:
        raise ValueError("Continue the exact original binder plan, inputs and resource budget.")
    return directory, manifest
