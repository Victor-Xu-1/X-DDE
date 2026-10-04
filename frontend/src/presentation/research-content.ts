/** Remove transport envelopes only; failed/unavailable outcomes and scientific fields remain. */
export function unwrapResult(value: unknown): unknown {
  for (let depth = 0; depth < 8; depth++) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value;
    const item = value as Record<string, unknown>;
    const envelope = Object.keys(item).every((key) =>
      [
        "result",
        "available",
        "error",
        "reason",
        "service",
        "endpoint",
        "job_id",
        "status",
        "progress",
      ].includes(key),
    );
    if (
      !envelope ||
      item.result == null ||
      item.available === false ||
      item.error ||
      item.reason ||
      (item.status && !["succeeded", "completed"].includes(String(item.status)))
    )
      return value;
    value = item.result;
  }
  return value;
}
const messages: Record<string, [string, string]> = {
  "No antibody-like structural analogs passed the domain filter.": [
    "未找到符合结构域筛选条件的相似抗体结构。",
    "No antibody-like structural analogs passed the domain filter.",
  ],
  too_few_structures: [
    "可比较的结构不足，未进行结构比较。",
    "Too few eligible structures for a comparison.",
  ],
  skipped: ["本次未计算", "Not calculated in this task"],
  succeeded: ["已完成", "Completed"],
  completed: ["已完成", "Completed"],
  "opendde-native": ["OpenDDE 计算结果", "OpenDDE computed results"],
  objective: ["模型目标分数", "Model objective"],
};
export function researchText(text: string, zh: boolean) {
  const clean = text
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^\s*(Report|Log|Debug|Manifest|Server URL|Cache path):/i.test(line),
    )
    .join("\n")
    .replace(
      /(?:\/(?:srv|opt|home|tmp|mnt)\/[^\s;]+|[A-Z]:\\[^\r\n;]+)/g,
      zh ? "内部文件" : "Internal file",
    );
  return messages[clean]?.[zh ? 0 : 1] ?? clean;
}
export function researchError(message: string, zh: boolean) {
  if (/Research evidence is invalid or changed/i.test(message))
    return zh
      ? "参考材料无法核验。请检查原始文件或重新获取材料，再用于后续任务。"
      : "The source record cannot be verified. Check the original material or retrieve it again before using it in later tasks.";
  if (
    /Traceback|ModuleNotFoundError|ImportError|CalledProcessError|ConnectionRefused|ECONNREFUSED|Docker daemon|stderr|stdout|exit code/i.test(
      message,
    )
  )
    return zh
      ? "当前计算服务未能完成此操作。请在安装与组件中检查所需工具与服务，然后重试。"
      : "The compute service could not complete this operation. Check the required tools and services in Installation & components, then retry.";
  return researchText(message.replace(/^Error:\s*/, ""), zh);
}
