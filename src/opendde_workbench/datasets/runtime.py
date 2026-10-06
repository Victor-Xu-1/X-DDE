"""Installation readiness stays separate from scientific dataset-result validation."""


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(
            state.get("reason") or "Prepare the selected scientific component first."
        )
    if request.payload.kind == "drugclip" and request.payload.use != "non_commercial":
        raise ValueError("The selected official DrugCLIP weights permit noncommercial research.")
    if request.options.device == "cuda" and state.get("gpu") is False:
        raise ValueError("This scientific environment does not support the selected GPU mode.")
