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
            assigned = {
                label
                for sample in task.payload.read_samples
                for label in (sample.input_label, sample.mate_label)
                if label
            }
            valid = len(set(labels)) == len(labels) and set(labels) == assigned and all(labels)
            masters = {sample.input_label for sample in task.payload.read_samples}
            mates = {sample.mate_label for sample in task.payload.read_samples if sample.mate_label}
            valid = valid and not masters.intersection(mates)
            valid = valid and all(
                len(
                    {
                        sample.input_label
                        for sample in task.payload.read_samples
                        if sample.mate_label == mate
                    }
                )
                == 1
                for mate in mates
            )
            for label in masters:
                group = [
                    sample for sample in task.payload.read_samples if sample.input_label == label
                ]
                valid = (
                    valid
                    and len({(sample.mate_label, sample.encoded_mate) for sample in group}) == 1
                )
    elif mode == "count":
        valid = not roles and source_roles == ["decoded"]
    elif mode == "analyze":
        valid = (roles == ["counts"] and not source_roles) or (
            not roles and source_roles == ["counts"]
        )
    elif mode == "model":
        valid = not roles and source_roles in (["analysis"], ["analysis", "definition"])
    elif mode == "series":
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
