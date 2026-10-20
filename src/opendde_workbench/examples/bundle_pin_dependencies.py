"""Keep reviewed historical source pins only when typed native inputs consume them."""

from .contracts import ExamplePin


def source_pins(rows, modules, capabilities):
    cases = {
        module.case_id
        for key, module in modules.items()
        if capabilities is None or key in capabilities
    }
    result = {}
    for index, row in enumerate(rows):
        module = modules.get(row["capability_id"])
        if module is None or not 1 <= row["revision"] <= module.revision:
            continue
        pin = ExamplePin.model_validate_json(row["body"])
        if pin.case_id != module.case_id or pin.case_id not in cases or pin.review is None:
            continue
        if (pin.capability_id, pin.revision, str(pin.job_id)) != (
            row["capability_id"],
            row["revision"],
            row["job_id"],
        ):
            raise ValueError("The reviewed native source pin differs from its stored identity.")
        result.setdefault(row["job_id"], []).append(index)
    return result
