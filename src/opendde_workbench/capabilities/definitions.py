"""The reviewed capability/form inventory is the sole semantic catalogue authority.

Frontend data is generated from these definitions, never maintained independently.
Native task routing still belongs to engine_registry and BackendRouter.
"""

from types import MappingProxyType

from ..engine_registry import engine_for
from ..harness_contract import TOOLS
from .catalogue import forms
from .contract import CapabilitySpec, ConstraintSupport

_BASE = forms() + (
    CapabilitySpec(
        id="native.inspect",
        group="prepare",
        environment="opendde",
        operations=("inspect",),
        label=("检查原生原子身份", "Inspect native atom identities"),
        note=(
            "用于共价输入的实体、拷贝、位置和原子校验。",
            "Validate entity, copy, position and atom identity for covalent inputs.",
        ),
        source="OpenDDE",
    ),
)

_DIFF = tuple(
    CapabilitySpec(
        id="diffsbdd." + mode,
        group=group,
        environment="diffsbdd",
        operations=("diffsbdd",),
        label=label,
        note=note,
        source="DiffSBDD",
        native_mode=mode,
        frontend_form="diffsbdd" if mode not in {"edit", "identity"} else None,
        constraint_support=(
            ConstraintSupport(kind="fixed_atoms", support="native", phase="sampling"),
            ConstraintSupport(kind="preserve_bonds", support="native", phase="sampling"),
        )
        if mode == "inpaint"
        else (),
    )
    for mode, group, label, note in (
        (
            "identity",
            "prepare",
            ("读取分子原子身份", "Read molecular atom identities"),
            (
                "真实解析器读取特定版本的原子身份。",
                "Read atom identities for the exact version with the real parser.",
            ),
        ),
        (
            "generate",
            "design",
            ("口袋条件分子生成", "Pocket-conditioned molecule generation"),
            (
                "使用真实受体、口袋和兼容模型。",
                "Use a real receptor, pocket and compatible native model.",
            ),
        ),
        (
            "inpaint",
            "design",
            ("局部重设计", "Local molecule inpainting"),
            (
                "明确固定原子、保留键和三维初始分子。",
                "Requires fixed atoms, retained bonds and an aligned 3D initial molecule.",
            ),
        ),
        (
            "diversify",
            "design",
            ("分子多样化", "Diversify molecules"),
            (
                "在兼容条件模型下处理三维初始分子。",
                "Use a 3D initial molecule and a compatible conditional model.",
            ),
        ),
        (
            "optimize",
            "design",
            ("分子优化", "Optimize molecules"),
            (
                "按原生 QED/SA 目标与有限种群、轮次运行。",
                "Use native QED/SA objectives with bounded populations and rounds.",
            ),
        ),
        (
            "pocket",
            "prepare",
            ("口袋检查", "Inspect pockets"),
            (
                "检查原生支持的残基或配体定义。",
                "Inspect native-supported residue or ligand pocket definitions.",
            ),
        ),
        (
            "prepare",
            "prepare",
            ("准备受体结构", "Prepare receptors"),
            (
                "按明确链、水、配体和氢处理选择生成新结果。",
                "Prepare a new result using explicit chain, water, ligand and hydrogen choices.",
            ),
        ),
        (
            "edit",
            "prepare",
            ("校验分子编辑", "Validate molecule edits"),
            (
                "在真实解析器中校验编辑并保留原版本。",
                "Validate edits with the real parser and retain the original version.",
            ),
        ),
        (
            "interactions",
            "analyze",
            ("分子相互作用", "Molecular interactions"),
            ("使用真实 ProLIF 规则和输入结构。", "Use actual ProLIF rules and input structures."),
        ),
        (
            "properties",
            "evaluate",
            ("候选描述符", "Candidate descriptors"),
            (
                "处理明确候选版本和记录。",
                "Process explicitly selected candidate versions and records.",
            ),
        ),
        (
            "export",
            "prepare",
            ("候选导出", "Export candidates"),
            ("导出明确候选集合。", "Export an explicitly selected candidate collection."),
        ),
    )
)

_ITEMS = _BASE + _DIFF
if len({item.id for item in _ITEMS}) != len(_ITEMS):
    raise RuntimeError("Capability IDs must be unique.")
for item in _ITEMS:
    if any(engine_for(operation).id != item.environment for operation in item.operations):
        raise RuntimeError("Capability routing differs from the trusted environment registry.")
    if item.native_tool is not None and item.native_tool not in TOOLS:
        raise RuntimeError("A capability references an unsupported native Harness tool.")
CAPABILITIES = MappingProxyType({item.id: item for item in _ITEMS})
