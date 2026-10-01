"""Input snapshots and operation-specific success criteria for the single job queue."""

import json
from pathlib import Path

from .assets import AssetStore
from .models import Job
from .prediction import Prediction


def prepare(job: Job, directory: Path, assets: AssetStore) -> None:
    bindings = assets.snapshot(job.request, directory)
    (directory / "request.json").write_text(job.request.model_dump_json(), encoding="utf-8")
    (directory / "bindings.json").write_text(json.dumps(bindings), encoding="utf-8")
    if isinstance(job.request, Prediction):
        (directory / "input.json").write_text(
            json.dumps(job.request.inference_input(job.id, bindings)), encoding="utf-8"
        )
    (directory / "output").mkdir(exist_ok=True)


def successful(job: Job, directory: Path, exit_code: int) -> bool:
    if exit_code != 0:
        return False
    output = directory / "output"
    operation = job.request.operation
    if operation == "doctor":
        (output / "environment.txt").write_text(
            (directory / "run.log").read_text(encoding="utf-8", errors="replace"), encoding="utf-8"
        )
        return True
    if operation == "predict":
        return any(p.stat().st_size for p in output.rglob("*.cif") if not p.is_symlink())
    manifest = output / "result.json"
    if not manifest.is_file() or manifest.stat().st_size > 25 * 1024**2:
        return False
    result = json.loads(manifest.read_text())
    if operation == "reference_import":
        from .discovery.import_runner import validate_import_result

        validate_import_result(result, job.request, output)
    if operation == "target_research":
        from .discovery.result import validate_result

        validate_result(result, job.request, output)
    if operation == "structure_prepare":
        from .receptors.preparation_result import validate_preparation

        validate_preparation(result, job.request, output)
    if operation == "receptor_ensemble":
        from .receptors.result import validate_result

        validate_result(result, job.request, output)
    if operation == "molecular_states":
        from .chemistry.result import validate_result

        validate_result(result, job.request, output)
    if operation == "diffsbdd" and job.request.payload.mode == "inpaint":
        execution = directory / "execution.json"
        required = (
            execution.is_file()
            and json.loads(execution.read_text()).get("core_verification") == "rdkit_fixed_core_v1"
        )
        if required or "core_verification" in result:
            from .diffsbdd.quality import validate_verification

            validate_verification(result, job.request, output)
    return result.get("operation") == operation and result.get("complete") is True
