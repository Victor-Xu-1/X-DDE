"""The reviewed capability/form inventory is the sole semantic catalogue authority.

Frontend data is generated from these definitions, never maintained independently.
Native task routing still belongs to engine_registry and BackendRouter.
"""

from types import MappingProxyType

from ..engine_registry import engine_for
from ..harness_contract import TOOLS
from .catalogue import forms
from .contract import CapabilitySpec, ConstraintSupport
from .modalities import modality_metadata

_BASE = forms() + (
    CapabilitySpec(
        id="native.inspect",
        **modality_metadata("native.inspect"),
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
        **modality_metadata("diffsbdd." + mode),
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

_PLATFORM = (
    CapabilitySpec(
        id="regions",
        **modality_metadata("regions"),
        group="prepare",
        environment="platform",
        operations=(),
        label=("定义完整分子的区域", "Define full-molecule regions"),
        note=(
            "在真实原子身份上标记固定核心、结合端、连接区和载荷；区域可重叠并复用。",
            "Annotate overlapping cores, binders, linkers and payloads "
            "using native atom identities.",
        ),
        source="X-DDE / RDKit",
        frontend_form="regions",
        submission="scientific_record",
        contract_source="RegionInput",
        scientific_validation="not_applicable",
    ),
    CapabilitySpec(
        id="workflows",
        **modality_metadata("workflows"),
        group="design",
        environment="platform",
        operations=(),
        label=("研究计划与连续任务", "Research plans and task workflows"),
        note=(
            "组合真实任务、声明依赖，保留每一步的输入与输出版本。",
            "Combine real tasks with dependencies and retain each step's input/output versions.",
        ),
        source="X-DDE",
        frontend_form="workflows",
        submission="research_plan",
        contract_source="PlanInput",
        scientific_validation="not_applicable",
    ),
)
_POCKETS = (
    CapabilitySpec(
        id="p2rank.detect",
        **modality_metadata("p2rank.detect"),
        group="analyze",
        environment="p2rank",
        operations=("pocket_search",),
        label=("发现多个候选口袋", "Discover candidate protein pockets"),
        note=(
            "使用 P2Rank 预测蛋白位点，保留多个假设及原生评分。",
            "Predict protein sites with P2Rank and retain multiple hypotheses and native scores.",
        ),
        source="P2Rank",
        frontend_form="p2rank",
        contract_source="PocketSearch",
    ),
)
_DOCKING = tuple(
    CapabilitySpec(
        id="gnina." + mode,
        **modality_metadata("gnina." + mode),
        group="structure" if mode == "dock" else "evaluate",
        environment="gnina",
        operations=("docking",),
        label=label,
        note=note,
        source="GNINA",
        native_mode=mode,
        frontend_form="docking",
        contract_source="DockingTask",
        constraint_support=(
            (
                (ConstraintSupport(kind="search_box", support="native", phase="input"),)
                if mode == "dock"
                else ()
            )
            + (ConstraintSupport(kind="spatial_bounds", support="result_check", phase="result"),)
        ),
    )
    for mode, label, note in (
        (
            "dock",
            ("探索分子结合模式", "Explore molecular binding poses"),
            (
                "在明确受体与搜索区域中保留多个原生姿势。",
                "Retain multiple native poses for an explicit receptor and search region.",
            ),
        ),
        (
            "score",
            ("评估已有结合姿势", "Score an existing pose"),
            (
                "确认坐标参照后计算原生评分，不改变姿势。",
                "Score a confirmed receptor-frame pose without moving it.",
            ),
        ),
        (
            "minimize",
            ("局部最小化结合姿势", "Locally minimize a binding pose"),
            (
                "保留原姿势并生成局部最小化结果；不是充分诱导契合。",
                "Retain the original and produce a local minimum; not full induced fit.",
            ),
        ),
    )
)
_CHEMISTRY = (
    CapabilitySpec(
        id="chemistry.states",
        **modality_metadata("chemistry.states"),
        group="prepare",
        environment="chemistry",
        operations=("molecular_states",),
        label=("准备分子状态与构象", "Prepare molecular states and conformers"),
        note=(
            "按 pH、互变和立体条件准备有来源的状态及游离三维构象。",
            "Prepare traceable pH/tautomer/stereo states and free three-dimensional conformers.",
        ),
        source="RDKit + Dimorphite-DL",
        frontend_form="molecular_states",
    ),
)
_RECEPTORS = (
    CapabilitySpec(
        id="biopython.ensemble",
        **modality_metadata("biopython.ensemble"),
        group="prepare",
        environment="biopython",
        operations=("receptor_ensemble",),
        label=("对齐多个受体构象", "Align receptor conformations"),
        note=(
            "复用已有蛋白结构，对齐到参照结构并保留对应和质量记录。",
            "Align existing protein structures to a reference "
            "with correspondence and quality evidence.",
        ),
        source="Biopython",
        frontend_form="receptor_ensemble",
    ),
)
_POSES = (
    CapabilitySpec(
        id="pose_exploration",
        **modality_metadata("pose_exploration"),
        group="structure",
        environment="platform",
        operations=(),
        label=("多受体与状态姿势探索", "Multi-receptor/state pose exploration"),
        note=(
            "组合真实位点、受体、分子状态和初始化，保留多个原生姿势及来源。",
            "Combine actual sites, receptors, chemical states and initializations; "
            "retain multiple native pose hypotheses and provenance.",
        ),
        source="X-DDE / GNINA",
        frontend_form="pose_exploration",
        submission="research_plan",
        contract_source="ExplorationInput",
    ),
)
_DISCOVERY = tuple(
    CapabilitySpec(
        id="discovery." + mode,
        **modality_metadata("discovery." + mode),
        group="search",
        environment="discovery",
        operations=("target_research",),
        label=label,
        note=note,
        source="Open Targets / UniProt / ChEMBL",
        frontend_form="target_research",
        native_mode=mode,
        scientific_validation="not_applicable",
    )
    for mode, label, note in (
        (
            "target",
            ("靶点证据与研究材料", "Target evidence and materials"),
            (
                "查询疾病关联、干预线索、序列、结构索引和已有实测活性。",
                "Retrieve disease associations, tractability, sequence, "
                "structure references and measured activities.",
            ),
        ),
        (
            "disease",
            ("从疾病寻找靶点", "Find targets for a disease"),
            (
                "查看人类靶点关联及来源，选择下一步研究对象。",
                "Review human target associations and provenance "
                "before selecting a research target.",
            ),
        ),
    )
)
_STRUCTURE_PREPARE = (
    CapabilitySpec(
        id="biopython.prepare",
        **modality_metadata("biopython.prepare"),
        group="prepare",
        environment="biopython",
        operations=("structure_prepare",),
        label=("结构准备", "Prepare structure"),
        note=(
            "选择模型、链、水和其他成分，保存新的结构版本。",
            "Select observed model, chains, water and components; save a new version.",
        ),
        source="Biopython",
        frontend_form="structure_prepare",
        scientific_validation="target_server_pending",
    ),
)
_REFERENCE_IMPORT = (
    CapabilitySpec(
        id="discovery.import",
        **modality_metadata("discovery.import"),
        group="prepare",
        environment="discovery",
        operations=("reference_import",),
        label=("导入参考结构与化合物", "Import reference structures and compounds"),
        note=(
            "从 PDB/ChEMBL 获取原始记录，保留证据与确切资产版本。",
            "Retrieve original PDB/ChEMBL records with evidence and exact asset versions.",
        ),
        source="RCSB PDB / ChEMBL",
        frontend_form="reference_import",
        scientific_validation="not_applicable",
    ),
)
_ITEMS = (
    _STRUCTURE_PREPARE
    + _REFERENCE_IMPORT
    + _DISCOVERY
    + _BASE
    + _DIFF
    + _PLATFORM
    + _POCKETS
    + _DOCKING
    + _CHEMISTRY
    + _RECEPTORS
    + _POSES
)
if len({item.id for item in _ITEMS}) != len(_ITEMS):
    raise RuntimeError("Capability IDs must be unique.")
for item in _ITEMS:
    if any(engine_for(operation).id != item.environment for operation in item.operations):
        raise RuntimeError("Capability routing differs from the trusted environment registry.")
    if item.native_tool is not None and item.native_tool not in TOOLS:
        raise RuntimeError("A capability references an unsupported native Harness tool.")
CAPABILITIES = MappingProxyType({item.id: item for item in _ITEMS})
