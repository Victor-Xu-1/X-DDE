"""Verified authored task recipes take precedence over illustrative study presets."""

import hashlib

from ...requests import TASK_ADAPTER, input_identifiers
from ..input_lineage import molecule_references
from ..pins import ExamplePins
from .catalogue import MODULES

DESIGN_MODES = {"generate", "inpaint", "diversify", "optimize"}


def reviewed_request(capability, scientific, records, *, modules=MODULES):
    if records is None:
        return None
    request = ExamplePins(scientific.store, records.settings.state_dir, modules=modules).request(
        capability, reviewed=True
    )
    if request is None:
        return None
    task = TASK_ADAPTER.validate_python(request)
    assets = {
        identifier: scientific.assets.get(identifier) for identifier in input_identifiers(task)
    }
    validated = set()
    for reference in molecule_references(task):
        if reference in validated:
            continue
        scientific.validate_reference(reference)
        identifier = str(reference.asset_id)
        if identifier not in assets:
            assets[identifier] = scientific.assets.get(identifier)
        asset = assets[identifier]
        if reference.sha256 != asset.sha256:
            raise ValueError("A reviewed task input differs from its exact scientific reference.")
        validated.add(reference)
    for asset in assets.values():
        with scientific.assets.path(asset).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != asset.sha256:
                raise ValueError("The reviewed task input bytes changed.")
    return request


def replay_context(study, capability, request=None):
    """Preparation is supplied by the sealed request; new dispatch still needs review."""
    components = (request or {}).get("components", [])
    if (
        capability == "predict"
        and len(components) == 1
        and (components[0].get("kind") == "protein" and components[0].get("count", 1) == 1)
    ):
        return {
            **study,
            "required_materials": [],
            "guide": {
                **study["guide"],
                "steps": [
                    (
                        "预测这条 STAT6 蛋白序列的三维结构。",
                        "Predict the structure of this STAT6 protein sequence.",
                    ),
                    (
                        "核对序列范围及已保存的非配对 MSA。",
                        "Review the sequence interval and saved unpaired MSA.",
                    )
                    if components[0].get("unpaired_msa")
                    else (
                        "核对序列范围及保存的输入材料。",
                        "Review the sequence interval and saved input materials.",
                    ),
                    (
                        "核对原任务的构象数量、模型和进化信息设置。",
                        "Review the saved sample count, model and evolutionary inputs.",
                    ),
                    (
                        "确认后提交新任务；查看局部结构置信度和误差图。",
                        "Submit a new task after confirmation; "
                        "inspect local confidence and error maps.",
                    ),
                ],
                "interpretation": (
                    "这是蛋白单体结构示例；截取区段的结果不能代表全长蛋白或结合活性。",
                    "This is a protein monomer example; an isolated construct does not establish "
                    "full-length behavior or binding activity.",
                ),
            },
        }
    if capability not in {"diffsbdd." + mode for mode in DESIGN_MODES}:
        return {**study, "required_materials": []}
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
