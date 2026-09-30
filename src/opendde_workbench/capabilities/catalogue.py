"""Reviewed form labels and bindings; the generated frontend is a projection."""

from .contract import CapabilitySpec

_ROWS = (
    (
        "predict",
        "structure",
        ("预测分子与复合物结构", "Predict structures and complexes"),
        (
            "蛋白、小分子、DNA、RNA、离子、共价连接；标准与 ABAG 模型。",
            "Proteins, ligands, DNA, RNA, ions and covalent bonds; standard and ABAG checkpoints.",
        ),
        "OpenDDE",
    ),
    (
        "properties",
        "evaluate",
        ("计算小分子性质", "Calculate molecular properties"),
        (
            "SMILES 或 SDF 批量计算 MW、LogP、TPSA、QED、SA、氢键与柔性指标。",
            "Batch descriptors from SMILES or SDF: MW, LogP, TPSA, QED, SA, "
            "hydrogen-bond counts and flexibility.",
        ),
        "RDKit",
    ),
    (
        "campaign",
        "design",
        ("抗体设计与 CDR 优化", "Antibody design and CDR optimization"),
        (
            "VHH、scFv、VH/VL；多轮候选生成、折叠评分、筛选与反思。",
            "VHH, scFv and VH/VL; iterative generation, folding, ranking and reflection.",
        ),
        "Harness + LLM",
    ),
    (
        "esm",
        "evaluate",
        ("蛋白序列评分", "Score protein sequences"),
        (
            "使用 ESM2 对现有序列评分，辅助候选比较。",
            "ESM2 scores for comparing existing sequences.",
        ),
        "Harness / ESM2",
    ),
    (
        "esm2",
        "design",
        ("ESM2 引导序列提案", "ESM2-guided sequence proposals"),
        (
            "指定可变位置，生成有模型评分支持的序列提案。",
            "Propose sequences at selected mutable positions with model scores.",
        ),
        "Harness / ESM2",
    ),
    (
        "mpnn",
        "design",
        ("结构引导序列设计", "Structure-guided sequence design"),
        (
            "使用 SolubleMPNN，在给定结构和可变位置上设计序列。",
            "SolubleMPNN sequence proposals for a structure and mutable positions.",
        ),
        "Harness / SolubleMPNN",
    ),
    (
        "fold",
        "structure",
        ("抗体候选折叠与评分", "Fold and score antibody candidates"),
        (
            "Harness 原生候选折叠、界面指标与目标评分。",
            "Native candidate folding, interface metrics and objectives.",
        ),
        "Harness / OpenDDE",
    ),
    (
        "epitope",
        "analyze",
        ("表位与热点接触", "Epitope and hotspot contacts"),
        (
            "分析抗体、抗原链及 CDR 对目标区域的接触。",
            "Inspect contacts between antibody CDRs and antigen regions.",
        ),
        "Harness",
    ),
    (
        "structure",
        "analyze",
        ("复合物相互作用分析", "Complex interaction analysis"),
        (
            "PLIP 结构分析，可比较最多三个候选。",
            "PLIP structural interaction analysis for up to three candidates.",
        ),
        "Harness / PLIP",
    ),
    (
        "rmsd",
        "analyze",
        ("对齐目标后比较结合姿势", "Compare target-aligned binding poses"),
        ("对齐目标链后计算结合链 RMSD。", "Align target chains and calculate binder RMSD."),
        "Harness",
    ),
    (
        "evolution",
        "analyze",
        ("候选进化树", "Candidate evolution tree"),
        (
            "从候选历史中查看谱系和目标分数变化。",
            "Review lineages and objective changes from candidate history.",
        ),
        "Harness",
    ),
    (
        "compare",
        "analyze",
        ("比较两个候选集", "Compare candidate populations"),
        (
            "比较两次设计的目标值、最佳候选与候选重合情况。",
            "Compare objectives, leading candidates and overlap across two design runs.",
        ),
        "Harness",
    ),
    (
        "protrek-sequence",
        "search",
        ("按蛋白序列检索", "Search by protein sequence"),
        (
            "连接配置的 ProTrek 服务，检索相似蛋白。",
            "Find similar proteins through the configured ProTrek service.",
        ),
        "Harness / ProTrek",
    ),
    (
        "protrek-structure",
        "search",
        ("按蛋白结构检索", "Search by protein structure"),
        ("选择结构和链，使用 ProTrek 检索。", "Search ProTrek using a structure and chain."),
        "Harness / ProTrek",
    ),
    (
        "target-msa",
        "prepare",
        ("准备抗体设计靶标 MSA", "Prepare target MSA for design"),
        (
            "由 Harness 搜索靶标比对，返回深度与缓存信息。",
            "Harness target alignment search with depth and cache metadata.",
        ),
        "Harness",
    ),
    (
        "features",
        "prepare",
        ("准备 MSA 与模板", "Prepare MSAs and templates"),
        (
            "蛋白 MSA、MSA＋模板、蛋白＋模板＋RNA MSA 三种原生流程。",
            "Native protein MSA, MSA plus templates, and full protein/template/RNA preparation.",
        ),
        "OpenDDE",
    ),
    (
        "import",
        "prepare",
        ("导入结构与批量任务", "Import structures and batch tasks"),
        (
            "PDB/CIF 转输入；导入原生 JSON，审阅后单次或批量提交。",
            "Convert PDB/CIF, import native JSON, review and submit single or batch tasks.",
        ),
        "OpenDDE",
    ),
    (
        "resources",
        "system",
        ("模型、数据库与环境检查", "Models, databases and diagnostics"),
        (
            "查看依赖状态，安装原生资源，运行 doctor。",
            "Inspect dependencies, install native resources and run doctor.",
        ),
        "OpenDDE",
    ),
)
_CORE = {
    "predict": ("predict",),
    "properties": ("properties",),
    "features": ("msa", "mt", "prep"),
    "import": ("json",),
    "resources": ("doctor", "resources"),
}


def forms() -> tuple[CapabilitySpec, ...]:
    result = []
    for identifier, group, label, note, source in _ROWS:
        campaign = identifier == "campaign"
        environment = "opendde" if identifier in _CORE else "harness"
        result.append(
            CapabilitySpec(
                id=identifier,
                group=group,
                label=label,
                note=note,
                source=source,
                environment=environment,
                operations=_CORE.get(identifier, () if campaign else ("harness",)),
                frontend_form=identifier,
                native_tool=identifier if environment == "harness" and not campaign else None,
                submission="native_campaign" if campaign else "task",
                contract_source="Native Harness config validated through /api/harness/plans"
                if campaign
                else "TaskRequest",
            )
        )
    return tuple(result)
