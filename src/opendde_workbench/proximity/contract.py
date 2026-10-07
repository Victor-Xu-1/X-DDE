"""Additional requirements for a two-protein, complete-molecule native task."""


def validate_task(task):
    payload = task.payload
    expected = {"partner_a", "partner_b", "ligand"}
    if payload.mechanism != "molecular_glue" and payload.input_mode == "binary_poses":
        expected |= {"arm_a", "arm_b"}
    if {item.role for item in task.inputs} != expected:
        raise ValueError(
            "Choose both protein partners and the complete molecule; "
            "bridged designs also need both exact binary arm poses."
        )
    if (
        task.options.device != "cpu"
        or not 4096 <= task.options.memory_mib <= 16384
        or task.options.cpu > 4
    ):
        raise ValueError("The reviewed ternary protocol uses 1–4 CPU cores and 4–16 GiB memory.")
