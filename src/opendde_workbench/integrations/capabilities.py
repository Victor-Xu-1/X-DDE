"""Research-oriented forms for the reviewed independent scientific programs."""

from ..capabilities.contract import CapabilitySpec

_ROWS = (
    (
        "openmm.dynamics",
        "analyze",
        "openmm",
        "molecular_dynamics",
        ("分子动力学", "Molecular dynamics"),
        (
            "在显式水中研究蛋白与结合姿势的动态稳定性。",
            "Study protein and bound-pose stability in explicit water.",
        ),
        ("chemical", "small_molecule", "biologic", "protein", "antibody", "rna"),
    ),
    (
        "openfe.rbfe",
        "evaluate",
        "openfe",
        "binding_free_energy",
        ("FEP 结合自由能", "FEP binding free energy"),
        (
            "构建同系列分子的相对自由能网络，检查误差与收敛。",
            "Plan congeneric free-energy networks and inspect uncertainty and convergence.",
        ),
        ("chemical", "small_molecule"),
    ),
    (
        "deepternary.model",
        "design",
        "deepternary",
        "ternary_model",
        ("三元复合物建模", "Ternary complex modeling"),
        (
            "比较降解剂、RIPTAC、分子胶与诱导邻近分子的完整装配假设。",
            "Compare complete PROTAC, RIPTAC, molecular-glue and proximity assemblies.",
        ),
        ("chemical", "small_molecule", "biologic", "protein"),
    ),
    (
        "boltz.predict",
        "structure",
        "boltz",
        "boltz_predict",
        ("复合物与亲和力预测", "Complex and affinity prediction"),
        (
            "用 Boltz-2 预测结构与模型亲和力，独立保存结果。",
            "Predict structures and model affinity with Boltz-2.",
        ),
        ("chemical", "small_molecule", "biologic", "protein", "antibody", "rna"),
    ),
    (
        "reinvent.design",
        "design",
        "reinvent",
        "reinvent_design",
        ("类似物与多目标分子设计", "Analogues and molecular optimization"),
        (
            "选择类似物、R 基、连接子或性质优化方案。",
            "Choose analogues, R-groups, linkers or property optimization.",
        ),
        ("chemical", "small_molecule"),
    ),
    (
        "ligandmpnn.design",
        "design",
        "ligandmpnn",
        "ligandmpnn_design",
        ("配体环境中的蛋白序列设计", "Ligand-aware protein sequence design"),
        (
            "选择要修改的残基，保留真实配体和结构环境。",
            "Select residues to redesign in their ligand context.",
        ),
        ("biologic", "protein", "antibody"),
    ),
    (
        "boltzgen.design",
        "design",
        "boltzgen",
        "boltzgen_design",
        ("结合蛋白、肽与抗体设计", "Protein, peptide and antibody design"),
        (
            "按药物形式选择设计方案，比较原生结构与界面结果。",
            "Choose a design modality and compare native structural results.",
        ),
        ("biologic", "protein", "peptide", "antibody"),
    ),
    (
        "openmm.refine",
        "prepare",
        "openmm",
        "structure_refine",
        ("结构准备与约束优化", "Structure preparation and refinement"),
        (
            "补齐已解析残基的原子并优化结构，保留原始文件。",
            "Prepare resolved atoms and refine structures while preserving originals.",
        ),
        ("chemical", "small_molecule", "biologic", "protein", "antibody"),
    ),
    (
        "apbs.potential",
        "analyze",
        "apbs",
        "electrostatics",
        ("蛋白表面电势", "Protein electrostatic surface"),
        (
            "在指定 pH 和盐浓度下计算电势并下载三维网格。",
            "Calculate potential at selected pH/salt conditions and export the grid.",
        ),
        ("biologic", "protein", "antibody", "rna"),
    ),
    (
        "chemprop.train",
        "evaluate",
        "chemprop",
        "chemprop_train",
        ("建立实验数据性质模型", "Train a property model"),
        (
            "从带标签的分子库训练模型，保留骨架划分验证与原始单位。",
            "Train from labeled molecular libraries with scaffold-split validation.",
        ),
        ("chemical", "small_molecule"),
    ),
    (
        "chemprop.predict",
        "evaluate",
        "chemprop",
        "chemprop_predict",
        ("用研究模型预测性质", "Predict with a research model"),
        (
            "选择已训练模型并预测新分子，保留模型版本与单位。",
            "Choose a trained model to predict new molecules with original units.",
        ),
        ("chemical", "small_molecule"),
    ),
    (
        "plip.profile",
        "analyze",
        "plip",
        "interaction_profile",
        ("结合相互作用与三维标注", "Interactions and 3D annotations"),
        (
            "显示原生化学相互作用类型、关键残基和真实距离。",
            "Display native interaction types, residues and coordinate distances.",
        ),
        ("chemical", "small_molecule", "biologic", "protein"),
    ),
)

CAPABILITIES = tuple(
    CapabilitySpec(
        id=identifier,
        group=group,
        environment=engine,
        operations=(operation,),
        label=label,
        note=note,
        source=engine,
        modalities=modalities,
        modality_role="research_object",
        frontend_form="simulation"
        if identifier in {"openmm.dynamics", "openfe.rbfe"}
        else "integrated",
    )
    for identifier, group, engine, operation, label, note, modalities in _ROWS
)
