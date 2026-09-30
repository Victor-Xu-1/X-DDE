"""Resolve actual native outputs into immutable scientific references, never paths."""

import json

from ..artifacts import contained
from ..requests import TASK_ADAPTER


def resolve(step, latest, store, outputs, settings):
    body = step.request.model_dump(mode="json")
    for binding in step.bindings:
        attempt = latest[binding.from_step]
        job = store.get(attempt["job_id"])
        if not job or job.status != "succeeded":
            raise ValueError("Output dependency has not succeeded.")
        root = settings.state_dir / "jobs" / job.id / "output"
        name = binding.artifact
        if binding.result_field:
            report = contained(root, "result.json")
            if report.stat().st_size > 25 * 1024**2:
                raise ValueError("Output report exceeds the handoff limit.")
            data = json.loads(report.read_text())
            name = data.get(binding.result_field)
            if not isinstance(name, str) or not 1 <= len(name) <= 500:
                raise ValueError("The declared output role is missing from the real result.")
        file = contained(root, name)
        _, versions = outputs.preserve(job.id, file, binding.kind)
        if binding.record >= len(versions):
            raise ValueError("Selected output record does not exist.")
        ref = versions[binding.record].reference.model_dump(mode="json")
        if binding.target == "docking_ligand":
            body["ligand"] = ref
        elif binding.target == "property_input":
            body["ligand_files"] = [ref["asset_id"]]
            body["scientific_inputs"] = [ref]
            body["smiles"] = []
        elif binding.target == "reference_ligand":
            body["payload"]["pocket"] = {"kind": "ligand", "ligand": ref}
        elif body["operation"] == "pocket_search" and binding.target == "protein":
            body["protein"] = ref
        else:
            body["payload"][binding.target] = ref
    # Contract validation rejects stale pocket/fixed-atom references and incompatible formats.
    return TASK_ADAPTER.validate_python(body)
