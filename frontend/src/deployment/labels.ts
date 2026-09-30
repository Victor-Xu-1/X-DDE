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
