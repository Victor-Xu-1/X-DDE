import type { Language } from "./types";

export const messages = {
  workspace: ["预测工作台", "Prediction workspace"],
  subtitle: [
    "从分子输入到结构结果。",
    "From molecular input to structural insight.",
  ],
  local: ["本机执行", "LOCAL EXECUTION"],
  language: ["界面语言", "Language"],
  ready: ["引擎就绪", "Engine ready"],
  unavailable: ["引擎未就绪", "Engine unavailable"],
  connecting: ["正在连接…", "Connecting…"],
  newTask: ["新建预测", "New prediction"],
  tasks: ["任务记录", "Tasks"],
  parameters: ["预测参数", "Prediction parameters"],
  inputs: ["分子输入", "Molecular inputs"],
  inputNote: [
    "添加蛋白序列、配体，或二者组成的复合物。",
    "Add protein sequences, ligands, or a protein–ligand complex.",
  ],
  name: ["任务名称", "Task name"],
  nameHint: ["例如：蛋白–配体结构预测", "e.g. Protein–ligand prediction"],
  protein: ["蛋白质", "Protein"],
  ligand: ["小分子 / 配体", "Small molecule / ligand"],
  component: ["组分", "Component"],
  copies: ["拷贝数", "Copies"],
  remove: ["移除", "Remove"],
  add: ["添加组分", "Add component"],
  sequence: ["单字母氨基酸序列", "One-letter amino-acid sequence"],
  smiles: ["SMILES 或 CCD_ 编号", "SMILES or CCD_ identifier"],
  seed: ["随机种子", "Random seed"],
  samples: ["采样数", "Samples"],
  steps: ["扩散步数", "Diffusion steps"],
  cycles: ["循环次数", "Cycles"],
  dtype: ["计算精度", "Precision"],
  resourceNote: [
    "8 GB 显存建议从 BF16、1 个样本和小体系开始；大体系可能超出显存。",
    "For 8 GB GPUs, start with BF16, one sample, and small systems. Larger systems may exceed memory.",
  ],
  noMsa: [
    "当前使用本地、无 MSA / 模板的预测流程。",
    "This version runs local predictions without MSA or templates.",
  ],
  submit: ["提交预测任务", "Run prediction"],
  submitting: ["正在提交…", "Submitting…"],
  demo: ["载入咖啡因验证输入", "Load caffeine test input"],
  demoNote: [
    "验证输入仅用于检查安装，不代表生物活性或药物效果。",
    "Test input checks the installation; it is not evidence of biological activity.",
  ],
  empty: ["还没有任务", "No tasks yet"],
  emptyNote: [
    "填写左侧分子输入，开始第一次预测。",
    "Add molecular inputs to start your first prediction.",
  ],
  select: ["选择一个任务查看详情", "Select a task to inspect"],
  selected: ["任务详情", "Task details"],
  queued: ["排队中", "Queued"],
  running: ["运行中", "Running"],
  cancelling: ["正在取消", "Cancelling"],
  succeeded: ["已完成", "Completed"],
  failed: ["失败", "Failed"],
  cancelled: ["已取消", "Cancelled"],
  interrupted: ["已中断", "Interrupted"],
  cancel: ["取消任务", "Cancel task"],
  retry: ["重新运行", "Run again"],
  cancelConfirm: [
    "确认停止此任务？已生成的文件会保留。",
    "Stop this task? Existing output files will be kept.",
  ],
  logs: ["执行日志", "Execution log"],
  noLogs: ["等待引擎输出…", "Waiting for engine output…"],
  logTail: ["显示最近 64 KiB 日志", "Showing the latest 64 KiB of logs"],
  results: ["结果文件", "Result files"],
  noResults: [
    "任务结束后，结果文件会显示在这里。",
    "Result files appear when the task finishes.",
  ],
  inputJson: ["下载输入 JSON", "Download input JSON"],
  created: ["创建时间", "Created"],
  elapsed: ["执行用时", "Elapsed"],
  seconds: ["秒", "sec"],
  refresh: ["刷新", "Refresh"],
  recent: ["最近 100 个任务", "Latest 100 tasks"],
  queueNote: [
    "单任务 GPU 队列 · 页面关闭后任务继续运行",
    "One GPU task at a time · Tasks continue when the page is closed",
  ],
  privacy: ["数据保留在本机", "Your data stays local"],
  privacyNote: [
    "预测容器关闭网络；序列和分子不会发送给模型服务。",
    "Prediction containers have no network access. Inputs are not sent to model providers.",
  ],
  boundaries: ["能力范围", "Capabilities"],
  supported: [
    "结构预测、任务管理、结果下载",
    "Prediction, task management, downloads",
  ],
  error: ["操作未完成", "Action failed"],
  connectionError: [
    "连接失败，现有数据保留。请检查本机服务后重试。",
    "Connection failed. Existing data is retained. Check the local service and retry.",
  ],
  requiredName: ["请填写任务名称。", "Enter a task name."],
  requiredInput: [
    "请至少填写一个分子组分。",
    "Enter at least one molecular component.",
  ],
  invalidProtein: [
    "请粘贴单条蛋白序列或单条 FASTA；多条序列请分别添加组分。",
    "Paste one protein sequence or FASTA record. Add separate components for multiple sequences.",
  ],
  invalidLigand: [
    "配体必须是 SMILES 或 CCD_ 编号，不能使用文件路径或网址。",
    "Use SMILES or a CCD_ identifier, not a file path or URL.",
  ],
  invalidNucleic: [
    "DNA 请使用 A/T/G/C/N/X，RNA 请使用 A/U/G/C/N/X；每个框只填一条序列。",
    "Use A/T/G/C/N/X for DNA and A/U/G/C/N/X for RNA, one sequence per field.",
  ],
  invalidIon: ["请从列表选择离子。", "Select an ion from the list."],
  savedSession: [
    "浏览器禁止保存偏好；语言选择仅对当前页面有效。",
    "Browser storage is unavailable; language applies to this page only.",
  ],
  loading: ["正在加载…", "Loading…"],
  configuration: ["引擎配置", "Engine configuration"],
  freeDisk: ["可用磁盘", "Free disk"],
  taskId: ["任务 ID", "Task ID"],
  version: ["版本", "Version"],
  footer: [
    "独立 MIT 项目 · 由 OpenDDE 引擎执行",
    "Independent MIT project · Powered by the OpenDDE engine",
  ],
} as const;

export type MessageKey = keyof typeof messages;
export function translator(language: Language) {
  return (key: MessageKey) => messages[key][language === "zh" ? 0 : 1];
}
export function restoreLanguage(): Language {
  try {
    return localStorage.getItem("opendde-workbench.language") === "en"
      ? "en"
      : "zh";
  } catch {
    return "zh";
  }
}
export function persistLanguage(language: Language): boolean {
  try {
    localStorage.setItem("opendde-workbench.language", language);
    return true;
  } catch {
    return false;
  }
}
