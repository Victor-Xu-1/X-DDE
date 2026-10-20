"""A study record cannot inherit an archived molecule, measurement or workflow result."""


def validate_study_record(capability, source, prepared, store, *, job_ids=None):
    if capability == "regions":
        expected = prepared.objects["study_protac"].reference.model_dump(mode="json")
        value = source["value"]
        if value["body"]["subject"] != expected:
            raise ValueError("The STAT6 region must refer to the exact specified PROTAC version.")
        job = store.get(value["body"]["identity_job"])
        if job.request.operation != "diffsbdd" or job.request.payload.mode != "identity":
            raise ValueError("The study region requires actual native atom identities.")
        return
    if capability == "experimental.evidence":
        from ...research.evidence_contracts import EvidenceDocument, EvidenceInput

        # Public summaries are derived UI output, not part of the immutable document.
        body = {key: value for key, value in source["value"].items() if key != "summaries"}
        document = EvidenceDocument.model_validate(body)
        expected = EvidenceInput.model_validate(prepared.evidence_draft)
        if document.request != expected or document.source_sha256 != expected.source.sha256:
            raise ValueError(
                "The fixed STAT6 evidence must retain the reviewed assay, "
                "molecules and original values."
            )
        return
    if capability in {"workflows", "pose_exploration", "campaign"}:
        from ..pin_validation import validate_input_lineage

        if capability == "workflows":
            from ...workflows.contracts import PlanInput

            if prepared.workflow_plan is None:
                raise ValueError("A fixed workflow requires the complete reviewed study plan.")
            expected = PlanInput.model_validate(prepared.workflow_plan)
            actual = PlanInput.model_validate(source["value"]["body"])
            if actual.model_copy(update={"name": expected.name}) != expected:
                raise ValueError(
                    "The fixed workflow must retain its reviewed steps and quality gates."
                )

        if not job_ids:
            raise ValueError(
                "Actual STAT6 source-validation evidence is required for this fixed record."
            )
        for identifier in job_ids:
            job = store.get(str(identifier))
            if job is None or job.status != "succeeded":
                raise ValueError(
                    "Every fixed STAT6 workflow step requires a successful native task."
                )
            validate_input_lineage(job, prepared, store)
        return
    raise ValueError("This study record does not have reviewed STAT6 result evidence.")
