"""A fixed result must belong to the reviewed public case and native operation."""

import json

from ..capabilities.definitions import CAPABILITIES
from ..requests import input_identifiers


def validate_case_job(capability_id, job, prepared, store):
    specification = CAPABILITIES[capability_id]
    if job.request.operation not in specification.operations:
        raise ValueError("The task does not execute this capability.")
    if (
        specification.native_tool
        and getattr(job.request, "tool", None) != specification.native_tool
    ):
        raise ValueError("The native tool does not match this example.")
    mode = getattr(
        job.request, "mode", getattr(getattr(job.request, "payload", None), "mode", None)
    )
    if job.request.operation == "target_research":
        mode = job.request.entity
    if specification.native_mode and mode != specification.native_mode:
        raise ValueError("The native mode does not match this example.")
    if prepared.module.parent_capability:
        from .analysis_validation import validate_analysis

        return validate_analysis(job, prepared, store)
    if job.request.operation == "reference_import":
        entry = prepared.case.evidence_entities.get("structure", {}).get("id", "3MXF")
        if job.request.source != "pdb" or job.request.identifier != entry:
            raise ValueError("The archive import does not belong to the reviewed case.")
        return
    if job.request.operation == "target_research":
        expected = prepared.case.evidence_entities.get(job.request.entity)
        if not expected or job.request.identifier != expected["id"]:
            raise ValueError("The evidence query does not belong to the reviewed case.")
        return
    if job.request.operation == "resources":
        return
    from ..datasets.contract import DatasetTask

    if isinstance(job.request, DatasetTask):
        from .dataset_pins import validate_dataset_case

        return validate_dataset_case(job, prepared, store)
    validate_input_lineage(job, prepared, store)


def validate_input_lineage(job, prepared, store):
    """Shared source-lineage policy for individual jobs and completed study workflows."""
    allowed = {str(obj.reference.asset_id) for obj in prepared.objects.values()}
    families = {str(obj.family_id) for obj in prepared.objects.values()}
    with store.connect() as db:
        pinned_jobs = {
            row["job_id"]
            for row in db.execute("SELECT job_id,body FROM example_pins")
            if json.loads(row["body"])["case_id"] == prepared.case.id
        }
        allowed |= {
            row["asset_id"]
            for row in db.execute("SELECT family_id,asset_id,body FROM scientific_objects")
            if row["family_id"] in families or json.loads(row["body"])["source_job"] in pinned_jobs
        }
    inputs = input_identifiers(job.request)
    if not inputs or not inputs <= allowed:
        raise ValueError("Every task input must belong to this example's scientific lineage.")
