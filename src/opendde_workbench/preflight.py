"""Operation-specific dependency checks, independent from transport."""

from .assets import AssetStore
from .prediction import Prediction
from .requests import TaskRequest


def check(request: TaskRequest, engine: dict, assets: AssetStore) -> None:
    assets.validate_bindings(request)
    if not engine.get("ready"):
        raise RuntimeError(engine.get("reason") or "Configure the OpenDDE runtime first.")
    resources = engine.get("resources", {})
    if isinstance(request, Prediction):
        p = request.parameters
        if request.operation == "predict":
            if not p.checkpoint_id and not engine.get("models", {}).get(
                p.model, p.model == "standard"
            ):
                raise RuntimeError(
                    "ABAG checkpoint is not available. Install it in Resources before prediction."
                    if p.model == "abag"
                    else "Standard checkpoint is not installed."
                )
            if p.device == "cuda" and not engine.get("gpu"):
                raise RuntimeError("CUDA is unavailable. Choose CPU or configure an NVIDIA GPU.")
            count = engine.get("gpu_count", 1 if engine.get("gpu") else 0)
            if p.gpu_ids and max(p.gpu_ids) >= count:
                raise ValueError("A selected GPU index does not exist on this server.")
        if resources and not resources.get("common"):
            raise RuntimeError("Install common CCD resources before molecular input processing.")
        if p.feature_mode == "search":
            if (
                p.use_template
                and any(c.kind == "protein" for c in request.components)
                and not resources.get("templates")
            ):
                raise RuntimeError(
                    "Template search databases are missing. Install the search bundle first."
                )
            if (
                p.use_rna_msa
                and any(c.kind == "rna" for c in request.components)
                and not resources.get("rna")
            ):
                raise RuntimeError(
                    "RNA search databases are missing. Install the search bundle first."
                )
