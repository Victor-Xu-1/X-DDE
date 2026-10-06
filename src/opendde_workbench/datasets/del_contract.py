"""Each DEL path needs only its real scientific materials and completed source stages."""


def validate_task(task):
    roles = [item.role for item in task.inputs]
    source_roles = [item.role for item in task.sources]
    mode = task.payload.mode
    if mode == "validate":
        valid = roles == ["definition"] and not source_roles
    elif mode == "enumerate":
        valid = not roles and source_roles == ["definition"]
    elif mode == "decode":
        valid = bool(roles) and set(roles) == {"reads"} and source_roles == ["definition"]
        if valid:
            labels = [item.label for item in task.inputs]
            assigned = {sample.input_label for sample in task.payload.read_samples}
            valid = len(set(labels)) == len(labels) and set(labels) == assigned and all(labels)
    elif mode == "count":
        valid = not roles and source_roles == ["decoded"]
    elif mode == "analyze":
        valid = (roles == ["counts"] and not source_roles) or (
            not roles and source_roles == ["counts"]
        )
    elif mode in {"series", "model"}:
        valid = not roles and source_roles == ["analysis"]
    elif mode == "candidates":
        valid = not roles and source_roles in (["analysis"], ["analysis", "definition"])
    else:
        valid = roles == ["counts"] and source_roles == ["analysis"]
    if not valid:
        raise ValueError(
            "Choose the exact scientific materials and completed source stages for this DEL path."
        )
    if task.options.device != "cpu":
        raise ValueError("The selected DEL data method uses the bounded CPU environment.")
