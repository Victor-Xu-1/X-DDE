"""Reviewed native design requests take precedence over illustrative input presets."""

from ...diffsbdd.contract import DiffTask, references
from ..pins import ExamplePins
from .catalogue import MODULES

DESIGN_MODES = {"generate", "inpaint", "diversify", "optimize"}


def reviewed_design(capability, scientific, records):
    if capability not in {"diffsbdd." + mode for mode in DESIGN_MODES} or records is None:
        return None
    request = ExamplePins(scientific.store, records.settings.state_dir, modules=MODULES).request(
        capability, reviewed=True
    )
    if request is None:
        return None
    task = DiffTask.model_validate(request)
    if task.payload.mode != capability.split(".")[1]:
        raise ValueError("The reviewed design recipe belongs to a different native mode.")
    for _, reference in references(task):
        scientific.validate_reference(reference)
    return request


def replay_context(study):
    """Preparation is supplied by the sealed request; new dispatch still needs review."""
    return {
        **study,
        "required_materials": [],
        "guide": {
            **study["guide"],
            "steps": [
                (
                    "已载入已复核任务的受体和起始分子（如有）；请核对材料。",
                    "Review the exact receptor and starting molecule, if present, "
                    "from the reviewed task.",
                ),
                (
                    "核对已保存的口袋、固定原子（如有）及坐标对应关系。",
                    "Review the saved pocket, fixed atoms if present, and coordinate alignment.",
                ),
                (
                    "沿用已保存的采样方案；修改模型或预算会形成新的研究条件。",
                    "Review the saved sampling settings; changing the model or budget "
                    "defines a new research condition.",
                ),
                (
                    "确认材料与当前模型可用性后提交新任务；原始结果保持不变。",
                    "Confirm inputs and current model availability before submitting a new task; "
                    "the original result remains unchanged.",
                ),
            ],
        },
    }
