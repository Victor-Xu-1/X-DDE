"""Expose the exact indexed prepared structure without changing native evidence."""

from ..receptors.preparation_presentation import saved_preparation_reference
from .result import validate_channels


def present_channels(value, job, output, store, assets):
    result = validate_channels(value, job.request, output)
    reference = saved_preparation_reference(result.preparation.sha256, job.id, store, assets)
    if reference is not None:
        value["prepared_reference"] = reference.model_dump(mode="json")
    return value
