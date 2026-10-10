"""Task-specific instructions refer to actual inputs or explicitly missing upstream data."""

from ...capabilities.definitions import CAPABILITIES

OBJECTIVES = {
    "predict": (
        "预测指定小分子与 STAT6 的复合物。",
        "Predict a complex of STAT6 and the study small molecule.",
    ),
    "discovery.target": ("查询 STAT6 的靶点证据。", "Retrieve target evidence for STAT6."),
    "discovery.disease": (
        "选择与 STAT6 有关的疾病，再查询关联证据。",
        "Choose a STAT6-related disease and retrieve association evidence.",
    ),
    "discovery.import": (
        "导入 STAT6 的 9BIG 实验参考结构。",
        "Import the experimental STAT6 reference structure 9BIG.",
    ),
    "biopython.ensemble": (
        "比较 9BIG 与 4Y5U 的 STAT6 受体构象。",
        "Compare STAT6 receptor conformations from 9BIG and 4Y5U.",
    ),
    "p2rank.detect": (
        "在 STAT6 实验受体上寻找候选口袋。",
        "Identify candidate pockets on the experimental STAT6 receptor.",
    ),
    "regions": (
        "在指定 PROTAC 上点选两端与连接区域。",
        "Select the two binding ends and linker of the supplied PROTAC.",
    ),
    "deepternary.model": (
        "研究 STAT6、CRBN 与指定 PROTAC 的三元体系。",
        "Study a ternary system of STAT6, CRBN and the supplied PROTAC.",
    ),
    "openfe.rbfe": (
        "加入同系列第二个分子，准备 STAT6 相对结合自由能网络。",
        "Add a second congeneric molecule to prepare a STAT6 relative binding free-energy network.",
    ),
    "chemprop.train": (
        "上传带 STAT6 实测活性标签的同系列分子集。",
        "Upload a compound series with measured STAT6 activity labels.",
    ),
    "chemprop.predict": (
        "选择已验证模型，预测指定分子的对应性质。",
        "Select a validated model to predict its documented endpoint for the study molecule.",
    ),
    "experimental.evidence": (
        "导入 STAT6 实测数据，说明指标、单位和实验条件。",
        "Import measured STAT6 data with endpoints, units and assay conditions.",
    ),
    "pose_exploration": (
        "先保存 STAT6 口袋，再对指定小分子探索结合姿势。",
        "Save STAT6 pocket hypotheses, then explore binding poses for the study molecule.",
    ),
    "pose.cluster": (
        "使用真实 STAT6 结合姿势探索结果进行聚类。",
        "Cluster actual STAT6 pose-exploration outputs.",
    ),
    "caver.paths": (
        "点选 STAT6 口袋起点，再分析通道与瓶颈。",
        "Select a starting region in STAT6 before analyzing channels and bottlenecks.",
    ),
}


def objective(capability):
    if capability in OBJECTIVES:
        return OBJECTIVES[capability]
    label = CAPABILITIES[capability].label
    return (
        f"使用 STAT6 研究材料进行{label[0]}。",
        f"Use STAT6 study materials for {label[1].lower()}.",
    )


def steps(capability):
    if capability in {"properties", "admet.predict"}:
        molecular_steps = {
            "properties": [
                (
                    "选择分子文件或 SMILES；模板提供指定的 STAT6 研究小分子。",
                    "Choose a molecule file or SMILES; "
                    "the template supplies the STAT6 study molecule.",
                ),
                (
                    "确认文件与分子记录；这项计算不需要蛋白结构或口袋。",
                    "Confirm the file and molecular records; "
                    "protein structures and pockets are not required.",
                ),
                (
                    "查看基础性质计算范围，可为这次计算填写任务名称。",
                    "Review the molecular property panel and optionally name this calculation.",
                ),
                (
                    "核对文件、记录范围及文字输入后递交，原始分子保持原样。",
                    "Confirm the file, record range and text inputs before submission; "
                    "original molecules remain unchanged.",
                ),
            ],
            "admet.predict": [
                (
                    "选择一个研究分子或一组候选；模板提供指定的 STAT6 研究小分子。",
                    "Choose one study molecule or a candidate collection; "
                    "the template supplies the STAT6 study molecule.",
                ),
                (
                    "确认 SDF 文件与分子记录；性质预测不需要受体或口袋。",
                    "Confirm the SDF file and molecular records; "
                    "property prediction does not require a receptor or pocket.",
                ),
                (
                    "选择先看全部性质、体内过程或早期安全性，按需展开专家微调。",
                    "Choose the initial property, ADME or early-safety view; "
                    "open expert adjustments when needed.",
                ),
                (
                    "核对分子与模型后递交；原始预测终点与分子分别保存供后续研究。",
                    "Confirm the molecules and model before submission; "
                    "retain native predictions and original molecules for subsequent research.",
                ),
            ],
        }
        return molecular_steps[capability]
    selection = (
        "核对来源后选择研究区域；小分子未结合构象不能用于定位蛋白口袋。",
        "Review sources and select a research region; "
        "an unbound study conformer cannot locate a protein pocket.",
    )
    if capability.startswith("del."):
        selection = (
            "导入本次 STAT6 选择实验的真实库定义、样品和对照数据。",
            "Import real library definitions, samples and controls "
            "from the STAT6 selection experiment.",
        )
    elif capability in {
        "antibody.humanize",
        "antibody.number",
        "fold",
        "evolution",
        "compare",
        "epitope",
    }:
        selection = (
            "加入真实 STAT6 抗体或结合蛋白材料；STAT6 本身的序列不是抗体序列。",
            "Add real STAT6 antibody or binder materials; "
            "the STAT6 target sequence is not an antibody sequence.",
        )
    elif capability.startswith("diffsbdd.") or capability == "gnina.dock":
        selection = (
            "使用同坐标系的 AK-1690 实验姿势定位参考口袋，再研究指定分子。",
            "Use the deposited AK-1690 pose in the matching receptor frame "
            "to define a reference site, then study the supplied molecule.",
        )
    elif capability in {
        "gnina.score",
        "gnina.minimize",
        "openmm.refine",
        "plip.profile",
        "posebusters.check",
        "openmm.dynamics",
        "gromacs.dynamics",
    }:
        selection = (
            "先加入指定分子与 STAT6 的计算结合姿势；参考配体的相互作用不属于指定分子。",
            "Provide a calculated bound pose of the supplied molecule and STAT6; "
            "reference-ligand interactions do not belong to the study molecule.",
        )
    return [
        objective(capability),
        selection,
        (
            "选择推荐方案，按需展开专家参数。",
            "Choose a recommended plan; open expert settings only when needed.",
        ),
        (
            "核对材料与缺少项后提交；实际结果会保存为独立研究版本。",
            "Review inputs and missing materials before submission; "
            "actual outputs are saved as separate research versions.",
        ),
    ]
