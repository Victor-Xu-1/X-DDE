export const names: Record<string, string> = {
  harness: "原生工具客户端",
  runtime: "OpenDDE 科学代码",
  compute: "计算环境",
  standard: "标准预测模型",
  abag: "抗体预测模型",
  ketcher: "分子绘图 · Ketcher",
  molstar: "蛋白与复合物 · Mol*",
};
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
