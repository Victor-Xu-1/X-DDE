"""Reviewed task-intent alternatives, not claims of identical input or scientific scores."""

from copy import deepcopy

from .definitions import CAPABILITIES

_METHOD_LABELS = {
    "deepternary": "DeepTernary",
    "boltz": "Boltz-2",
    "reinvent": "REINVENT4",
    "boltzgen": "BoltzGen",
    "ligandmpnn": "LigandMPNN",
    "openmm": "OpenMM",
    "gromacs": "GROMACS",
    "openfe": "OpenFE",
    "chemprop": "Chemprop",
    "apbs": "APBS",
    "plip": "PLIP",
}


def method_name(source: str) -> str:
    """Display names never replace immutable engine identifiers or scientific sources."""
    return _METHOD_LABELS.get(source, source)


_GROUPS = (
    {
        "id": "complex_structure",
        "label": ("复合物结构预测", "Complex structure prediction"),
        "options": (
            {
                "id": "predict",
                "label": "OpenDDE",
                "note": (
                    "标准与抗体专用模型；支持范围以当前表单为准。",
                    "Standard and antibody-specific checkpoints; "
                    "use the current form's supported inputs.",
                ),
            },
            {
                "id": "boltz.predict",
                "label": "Boltz-2",
                "note": (
                    "复合物结构与可选亲和力模型；参数和置信度不能与其他方法直接混用。",
                    "Complex structures and optional model affinity; "
                    "parameters and confidence are method-specific.",
                ),
            },
        ),
    },
    {
        "id": "structure_guided_sequence",
        "label": ("结构引导序列设计", "Structure-guided sequence design"),
        "options": (
            {
                "id": "mpnn",
                "label": "SolubleMPNN",
                "note": (
                    "适合可溶性蛋白的结构引导序列提案。",
                    "Structure-guided sequence proposals for soluble proteins.",
                ),
            },
            {
                "id": "ligandmpnn.design",
                "label": "LigandMPNN",
                "note": (
                    "在保留的配体和结构环境中设计蛋白序列。",
                    "Design protein sequences in retained ligand and structural context.",
                ),
            },
        ),
    },
    {
        "id": "molecular_dynamics",
        "label": ("分子动力学", "Molecular dynamics"),
        "options": (
            {
                "id": "openmm.dynamics",
                "label": "OpenMM",
                "note": (
                    "当前默认；保留原生最小化、显式水采样和历史结果。",
                    "Current default: native minimization, explicit-water sampling "
                    "and retained results.",
                ),
            },
            {
                "id": "gromacs.dynamics",
                "label": "GROMACS",
                "note": (
                    "独立 CPU/CUDA 环境；原生轨迹与检查点；科学验收待服务器执行。",
                    "Independent CPU/CUDA environment, native trajectories and checkpoints; "
                    "scientific acceptance requires the target server.",
                ),
            },
        ),
    },
)


def method_choices():
    groups = deepcopy(list(_GROUPS))
    identifiers = set()
    for group in groups:
        group["default"] = group["options"][0]["id"]
        group["default_basis"] = (
            "按任务用途保留当前默认；新方法需匹配输入比较后再替换。",
            "Keep the current task default until matched-input comparison supports replacement.",
        )
        for option in group["options"]:
            key = option["id"]
            spec = CAPABILITIES.get(key)
            if spec is None or spec.frontend_form is None or key in identifiers:
                raise ValueError("Model choices require unique registered executable forms.")
            identifiers.add(key)
    for spec in CAPABILITIES.values():
        if spec.frontend_form is None or spec.id in identifiers:
            continue
        groups.append(
            {
                "id": "method." + spec.id,
                "label": spec.label,
                "default": spec.id,
                "default_basis": (
                    "当前唯一接入的方法，已默认选中。",
                    "The only integrated method is selected by default.",
                ),
                "options": (
                    {
                        "id": spec.id,
                        "label": method_name(spec.source),
                        "note": spec.note,
                    },
                ),
            }
        )
        identifiers.add(spec.id)
    expected = {spec.id for spec in CAPABILITIES.values() if spec.frontend_form}
    if identifiers != expected:
        raise ValueError("Every executable task requires one selected backend method.")
    return groups
