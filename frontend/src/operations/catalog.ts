export const tools = [
  {
    id: "predict",
    group: "structure",
    label: ["预测分子与复合物结构", "Predict structures and complexes"],
    note: [
      "蛋白、小分子、DNA、RNA、离子、共价连接；标准与 ABAG 模型。",
      "Proteins, ligands, DNA, RNA, ions and covalent bonds; standard and ABAG checkpoints.",
    ],
    source: "OpenDDE",
  },
  {
    id: "properties",
    group: "evaluate",
    label: ["计算小分子性质", "Calculate molecular properties"],
    note: [
      "SMILES 或 SDF 批量计算 MW、LogP、TPSA、QED、SA、氢键与柔性指标。",
      "Batch descriptors from SMILES or SDF: MW, LogP, TPSA, QED, SA, hydrogen-bond counts and flexibility.",
    ],
    source: "RDKit",
  },
  {
    id: "campaign",
    group: "design",
    label: ["抗体设计与 CDR 优化", "Antibody design and CDR optimization"],
    note: [
      "VHH、scFv、VH/VL；多轮候选生成、折叠评分、筛选与反思。",
      "VHH, scFv and VH/VL; iterative generation, folding, ranking and reflection.",
    ],
    source: "Harness + LLM",
  },
  {
    id: "esm",
    group: "evaluate",
    label: ["蛋白序列评分", "Score protein sequences"],
    note: [
      "使用 ESM2 对现有序列评分，辅助候选比较。",
      "ESM2 scores for comparing existing sequences.",
    ],
    source: "Harness / ESM2",
  },
  {
    id: "esm2",
    group: "design",
    label: ["ESM2 引导序列提案", "ESM2-guided sequence proposals"],
    note: [
      "指定可变位置，生成有模型评分支持的序列提案。",
      "Propose sequences at selected mutable positions with model scores.",
    ],
    source: "Harness / ESM2",
  },
  {
    id: "mpnn",
    group: "design",
    label: ["结构引导序列设计", "Structure-guided sequence design"],
    note: [
      "使用 SolubleMPNN，在给定结构和可变位置上设计序列。",
      "SolubleMPNN sequence proposals for a structure and mutable positions.",
    ],
    source: "Harness / SolubleMPNN",
  },
  {
    id: "fold",
    group: "structure",
    label: ["抗体候选折叠与评分", "Fold and score antibody candidates"],
    note: [
      "Harness 原生候选折叠、界面指标与目标评分。",
      "Native candidate folding, interface metrics and objectives.",
    ],
    source: "Harness / OpenDDE",
  },
  {
    id: "epitope",
    group: "analyze",
    label: ["表位与热点接触", "Epitope and hotspot contacts"],
    note: [
      "分析抗体、抗原链及 CDR 对目标区域的接触。",
      "Inspect contacts between antibody CDRs and antigen regions.",
    ],
    source: "Harness",
  },
  {
    id: "structure",
    group: "analyze",
    label: ["复合物相互作用分析", "Complex interaction analysis"],
    note: [
      "PLIP 结构分析，可比较最多三个候选。",
      "PLIP structural interaction analysis for up to three candidates.",
    ],
    source: "Harness / PLIP",
  },
  {
    id: "rmsd",
    group: "analyze",
    label: ["对齐目标后比较结合姿势", "Compare target-aligned binding poses"],
    note: [
      "对齐目标链后计算结合链 RMSD。",
      "Align target chains and calculate binder RMSD.",
    ],
    source: "Harness",
  },
  {
    id: "evolution",
    group: "analyze",
    label: ["候选进化树", "Candidate evolution tree"],
    note: [
      "从候选历史中查看谱系和目标分数变化。",
      "Review lineages and objective changes from candidate history.",
    ],
    source: "Harness",
  },
  {
    id: "compare",
    group: "analyze",
    label: ["比较两个候选集", "Compare candidate populations"],
    note: [
      "比较两次设计的目标值、最佳候选与候选重合情况。",
      "Compare objectives, leading candidates and overlap across two design runs.",
    ],
    source: "Harness",
  },
  {
    id: "protrek-sequence",
    group: "search",
    label: ["按蛋白序列检索", "Search by protein sequence"],
    note: [
      "连接配置的 ProTrek 服务，检索相似蛋白。",
      "Find similar proteins through the configured ProTrek service.",
    ],
    source: "Harness / ProTrek",
  },
  {
    id: "protrek-structure",
    group: "search",
    label: ["按蛋白结构检索", "Search by protein structure"],
    note: [
      "选择结构和链，使用 ProTrek 检索。",
      "Search ProTrek using a structure and chain.",
    ],
    source: "Harness / ProTrek",
  },
  {
    id: "target-msa",
    group: "prepare",
    label: ["准备抗体设计靶标 MSA", "Prepare target MSA for design"],
    note: [
      "由 Harness 搜索靶标比对，返回深度与缓存信息。",
      "Harness target alignment search with depth and cache metadata.",
    ],
    source: "Harness",
  },
  {
    id: "features",
    group: "prepare",
    label: ["准备 MSA 与模板", "Prepare MSAs and templates"],
    note: [
      "蛋白 MSA、MSA＋模板、蛋白＋模板＋RNA MSA 三种原生流程。",
      "Native protein MSA, MSA plus templates, and full protein/template/RNA preparation.",
    ],
    source: "OpenDDE",
  },
  {
    id: "import",
    group: "prepare",
    label: ["导入结构与批量任务", "Import structures and batch tasks"],
    note: [
      "PDB/CIF 转输入；导入原生 JSON，审阅后单次或批量提交。",
      "Convert PDB/CIF, import native JSON, review and submit single or batch tasks.",
    ],
    source: "OpenDDE",
  },
  {
    id: "resources",
    group: "system",
    label: ["模型、数据库与环境检查", "Models, databases and diagnostics"],
    note: [
      "查看依赖状态，安装原生资源，运行 doctor。",
      "Inspect dependencies, install native resources and run doctor.",
    ],
    source: "OpenDDE",
  },
] as const;
export type ToolId = (typeof tools)[number]["id"];
