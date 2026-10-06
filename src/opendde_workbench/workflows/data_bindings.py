"""Dataset stages pass confirmed native source versions through the existing workflow authority."""

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..artifacts import contained
from ..datasets.contract import DatasetTask, NativeSource
from ..datasets.result import RESULT_KINDS, validate_result


class DataBinding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    from_step: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,31}$")
    slot: int = Field(ge=0, le=34)
    role: Literal[
        "library", "index", "definition", "decoded", "counts", "analysis", "model", "screening"
    ]
    select_candidates: bool = False
    select_samples: bool = False


def validate_graph(step, predecessors):
    if step.data_bindings and not isinstance(step.request, DatasetTask):
        raise ValueError(
            "Native dataset bindings require the reviewed scientific data task contract."
        )
    slots = [binding.slot for binding in step.data_bindings]
    if len(set(slots)) != len(slots):
        raise ValueError("Each dataset source slot must have one explicit producing step.")
    for binding in step.data_bindings:
        previous = predecessors.get(binding.from_step)
        if previous is None or binding.from_step not in step.depends_on:
            raise ValueError(
                "Dataset bindings require a successful explicitly declared predecessor."
            )
        if (
            not isinstance(previous.request, DatasetTask)
            or RESULT_KINDS[previous.request.operation] != binding.role
        ):
            raise ValueError("A workflow dataset producer has a different scientific output role.")
        if binding.role == "model" and (
            previous.request.operation != "del_model"
            or previous.request.payload.model_action != "train"
        ):
            raise ValueError(
                "Model reuse requires a training stage, not applied model predictions."
            )
        if (
            binding.slot >= len(step.request.sources)
            or step.request.sources[binding.slot].role != binding.role
        ):
            raise ValueError(
                "The planned dataset source slot differs from its declared scientific role."
            )
        if step.request.sources[binding.slot].report_sha256 != "0" * 64:
            raise ValueError(
                "Planned source slots must be explicitly unresolved before real results exist."
            )
        if binding.select_candidates and step.request.operation not in {
            "screening_dock",
            "del_candidates",
        }:
            raise ValueError(
                "Automatic candidate handoff is only valid for supported candidate operations."
            )
        if binding.select_samples and step.request.operation != "del_analyze":
            raise ValueError("Sample handoff requires a DEL count-analysis stage.")


def resolve_data(step, latest, store, settings, body):
    for binding in step.data_bindings:
        job = store.get(latest[binding.from_step]["job_id"])
        if not job or job.status != "succeeded" or not isinstance(job.request, DatasetTask):
            raise ValueError("The planned native dataset stage has not successfully completed.")
        root = settings.state_dir / "jobs" / job.id / "output"
        file = contained(root, "result.json")
        if file.stat().st_size > 4 * 1024**2:
            raise ValueError("Native data summary exceeds its bounded handoff budget.")
        content = file.read_bytes()
        result = validate_result(json.loads(content), job.request, root)
        if result.data_kind != binding.role:
            raise ValueError("The completed native stage has a different scientific role.")
        reference = NativeSource(
            job_id=job.id, role=binding.role, report_sha256=hashlib.sha256(content).hexdigest()
        )
        body["sources"][binding.slot] = reference.model_dump(mode="json")
        if binding.select_candidates:
            candidates = [row.id for row in result.candidates if row.artifact]
            if not candidates:
                raise ValueError(
                    "The preceding stage produced no resolved candidates for this handoff."
                )
            body["payload"]["selected_ids"] = candidates[:500]
        if binding.select_samples:
            present = set(result.metadata.get("sample_totals", {}))
            if any(sample["column"] not in present for sample in body["payload"]["samples"]):
                raise ValueError(
                    "A planned sample did not produce counts; revise the explicit study design."
                )
    return body
