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
        raise ValueError(
            "Reviewed STAT6 assay measurements are required before fixing an experimental result."
        )
    if capability in {"workflows", "pose_exploration", "campaign"}:
        from ..pin_validation import validate_input_lineage

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
