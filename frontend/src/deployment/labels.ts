import type { ComponentPackage } from "./component-groups";

export const names: Record<string, string> = {
  "public-examples": "公开研发案例",
  "public-surface-examples": "结构空间分析案例",
  "public-dataset-examples": "高通量筛选与 DEL 案例",
  "supplier-libraries": "供应商公开结构文件",
  drugclip: "高通量筛选引擎",
  "drugclip-models": "六模型筛选资源",
  sapiens: "抗体人源参考 · Sapiens / ANARCII / Promb",
  harness: "OpenDDE Harness 客户端",
  runtime: "OpenDDE 科学代码",
  compute: "OpenDDE 计算环境",
  standard: "OpenDDE 标准预测模型",
  abag: "OpenDDE 抗体预测模型",
  ketcher: "分子绘图 · Ketcher",
  molstar: "蛋白与复合物 · Mol*",
  biopython: "受体准备 · Biopython",
  chemistry: "分子准备 · RDKit",
  gnina: "分子对接 · GNINA",
  admet: "性质预测 · ADMET-AI",
  posebusters: "姿势质控 · PoseBusters",
  anarcii: "抗体编号 · ANARCII",
  "p2rank-compute": "P2Rank · Java 环境",
  p2rank: "口袋寻找 · P2Rank",
  "opendde-tools": "搜索数据库解压工具",
  "opendde-search": "模板与 RNA 搜索数据库",
};

export function componentName(p: ComponentPackage, zh: boolean) {
  const model =
    /^diffsbdd-model-(crossdocked|moad)_(ca|fullatom)_(cond|joint)$/.exec(p.id);
  if (model)
    return `${model[1] === "moad" ? "MOAD" : "CrossDocked"} · ${model[2] === "ca" ? "Cα" : zh ? "全原子" : "Full atom"} · ${model[3] === "cond" ? (zh ? "条件模型" : "Conditional") : zh ? "联合模型" : "Joint"}`;
  const english: Record<string, string> = {
    drugclip: "High-throughput screening engine",
    "drugclip-models": "Six-model screening resources",
    biopython: "Receptor preparation · Biopython",
    chemistry: "Molecule preparation · RDKit",
    gnina: "Molecular docking · GNINA",
    sapiens: "Antibody reference · Sapiens",
    "opendde-tools": "Search archive tools",
    "opendde-search": "Template and RNA databases",
  };
  return (zh ? names[p.id] : english[p.id]) || p.name;
}

export function componentSize(p: ComponentPackage, zh: boolean) {
  const parts = p.size.split(" / ");
  const value = parts[zh ? 0 : 1] ?? parts[0];
  // Some upstream labels translate only “download”; retain their actual size.
  return !zh && /\d/.test(parts[0]) && !/\d/.test(value)
    ? parts[0].replace(/约\s*/g, "~").replace(/下载/g, "download")
    : value;
}
export const states: Record<string, string> = {
  queued: "等待依赖 / 排队中",
  running: "正在安装",
  pausing: "正在暂停",
  paused: "已暂停",
  failed: "需要处理",
  succeeded: "完成",
  cancelled: "已取消",
};

export function stageLabel(stage: string, zh: boolean): string {
  if (!zh) return stage;
  const messages: Record<string, string> = {
    "Building independent Sapiens/ANARCII/Promb CPU environment":
      "正在安装独立的抗体 CPU 环境",
    Waiting: "等待开始；依赖未就绪时请先处理前面的安装",
    Starting: "准备安装",
    "Preparing verified release": "校验官方发行包",
    "Extracting and verifying editor files": "解压并检查编辑器文件",
    "Installing native Harness in an isolated environment":
      "正在安装独立的 Harness 客户端环境",
    "Preparing official OpenDDE, PLIP and MPNN sources":
      "正在准备 OpenDDE、PLIP、MPNN 官方代码",
    "Preparing official, checksum-verified model resources":
      "正在下载并校验官方模型资源",
    "Pulling official compute image; Docker resumes completed layers on retry":
      "正在下载计算镜像；重试会复用已完成的镜像层",
    "Installation stopped": "安装未完成，请查看原因后重试",
    "Paused; verified downloads can be reused":
      "已暂停；继续时复用已验证的下载",
    "Interrupted; resume to continue": "上次安装中断，可点击继续",
    "Cancelled; cached downloads retained": "已取消，保留已下载的缓存",
    "Installed; restart UI to activate compute changes":
      "安装完成；计算组件更改需重启工作台",
    "Uninstalled; models, caches and shared Docker layers retained":
      "已卸载；模型、缓存和共享 Docker 镜像已保留",
  };
  return (
    messages[stage] ??
    stage
      .replace(/^Downloading (\d+)%$/, "正在下载 $1%")
      .replace(/^Downloaded (\d+) MiB$/, "已下载 $1 MiB")
  );
}
