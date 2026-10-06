"""The user-facing screening and DEL inventory is derived from the actual native task registry."""

from ..capabilities.contract import CapabilitySpec

DEFINITIONS = (
    (
        "library.import",
        "chemistry",
        "prepare",
        "library_prepare",
        "prepare",
        ("分子库管理", "Compound libraries"),
        (
            "导入供应商文件，保留货号、结构与每条失败记录。",
            "Import supplier files with original IDs, chemistry and rejected records.",
        ),
    ),
    (
        "library.select",
        "chemistry",
        "subset",
        "library_subset",
        "prepare",
        ("提取候选分子", "Extract candidates"),
        (
            "从确切分子库选择成员，生成可用于后续任务的候选集。",
            "Select exact library members and prepare a reusable candidate set.",
        ),
    ),
    (
        "drugclip.index",
        "drugclip",
        "index",
        "drugclip_index",
        "prepare",
        ("建立快速筛选库", "Prepare a screening index"),
        (
            "使用官方六折模型编码分子，后续筛选直接使用索引。",
            "Encode molecules with the official six-fold model for reusable screening.",
        ),
    ),
    (
        "drugclip.screen",
        "drugclip",
        "retrieve",
        "drugclip_retrieve",
        "search",
        ("高通量筛选", "High-throughput screening"),
        (
            "选择靶点口袋和分子库，快速寻找候选；仅非商业科研。",
            "Search molecular libraries for an observed target pocket; noncommercial research.",
        ),
    ),
    (
        "screening.dock",
        "gnina",
        "batch",
        "screening_dock",
        "structure",
        ("候选批量对接", "Dock shortlisted candidates"),
        (
            "计算真实结合姿势，保留每个候选的得分与失败原因。",
            "Compute real binding poses with candidate scores and explicit failures.",
        ),
    ),
    (
        "del.library",
        "deli",
        "validate",
        "del_validate",
        "prepare",
        ("DEL 库定义", "DEL library definition"),
        (
            "检查周期、砌块、编码冲突与已有化学规则。",
            "Review cycles, building blocks, barcode ambiguity and supplied chemistry.",
        ),
    ),
    (
        "del.enumerate",
        "deli",
        "enumerate",
        "del_enumerate",
        "prepare",
        ("DEL 成员结构", "DEL member structures"),
        (
            "按核实的库规则解析成员，支持候选预览和大库导出。",
            "Resolve structures using supplied library rules; preview or export members.",
        ),
    ),
    (
        "del.decode",
        "deli",
        "decode",
        "del_decode",
        "analyze",
        ("测序解码", "Decode selection reads"),
        (
            "检查真实读段、匹配条码，保留歧义及未匹配原因。",
            "Inspect reads and call barcodes with ambiguity and rejection evidence.",
        ),
    ),
    (
        "del.count",
        "deli",
        "count",
        "del_count",
        "analyze",
        ("UMI 与计数", "UMI and counts"),
        (
            "在样本和化合物内去重，分别保留读段和 UMI 计数。",
            "Count UMIs within each sample and compound; retain raw-read evidence.",
        ),
    ),
    (
        "del.analyze",
        "deli",
        "analyze",
        "del_analyze",
        "analyze",
        ("DEL 富集与命中", "DEL enrichment and hits"),
        (
            "按实验分组比较富集、对照、重复一致性与候选证据。",
            "Compare enrichment, references, replicates and candidate evidence.",
        ),
    ),
    (
        "del.series",
        "deli",
        "series",
        "del_series",
        "analyze",
        ("砌块与系列探索", "Building blocks and series"),
        (
            "探索单砌块、双砌块组合和真实观察到的系列覆盖。",
            "Explore mono-/disynthon evidence and observed series coverage.",
        ),
    ),
    (
        "del.model",
        "deli",
        "model",
        "del_model",
        "evaluate",
        ("DEL 研究模型", "DEL research models"),
        (
            "使用独立砌块留出评估分子富集基线，不预测实测亲和力。",
            "Evaluate an enrichment baseline using independent cycle holdout; not affinity.",
        ),
    ),
    (
        "del.candidates",
        "deli",
        "candidates",
        "del_candidates",
        "prepare",
        ("DEL 候选交接", "DEL candidate handoff"),
        (
            "解析所选命中结构，交给性质分析和对接任务。",
            "Resolve selected hit structures for property evaluation and docking.",
        ),
    ),
    (
        "del.followup",
        "deli",
        "followup",
        "del_followup",
        "analyze",
        ("后续实验回填", "Follow-up measurements"),
        (
            "登记用户提供的 KD、IC50 等测量，与计算富集分开。",
            "Record user-supplied KD/IC50 measurements separately from enrichment.",
        ),
    ),
)

CAPABILITIES = tuple(
    CapabilitySpec(
        id=identifier,
        environment=engine,
        native_mode=mode,
        operations=(operation,),
        group=group,
        modalities=("chemical", "small_molecule"),
        modality_role="target_context" if engine in {"drugclip", "gnina"} else "research_object",
        label=label,
        note=note,
        source={
            "chemistry": "RDKit",
            "drugclip": "Official DrugCLIP",
            "gnina": "GNINA",
            "deli": "DELi",
        }[engine],
        frontend_form="datasets",
        contract_source="DatasetTask",
    )
    for identifier, engine, mode, operation, group, label, note in DEFINITIONS
)
