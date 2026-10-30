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
  "Required pose-quality checks did not pass. Open the quality step for measured results and missing checks.":
    [
      "姿势质控未通过指定检查。请打开质控步骤，查看实测结果及缺失的检查。",
      "Required pose-quality checks did not pass. Open the quality step for measured results and missing checks.",
    ],
  "The task action could not be confirmed. Try again to continue the same action.":
    [
      "未能确认任务操作的结果。请重试，系统会继续同一次操作。",
      "The task action could not be confirmed. Try again to continue the same action.",
    ],
  "The task was updated, but its page could not be opened. Open it from Tasks and results.":
    [
      "任务已更新，但未能自动打开。请在任务与结果中查看。",
      "The task was updated, but its page could not be opened. Open it from Tasks and results.",
    ],
  "Task submission could not be confirmed. Submit again to continue the same request.":
    [
      "未能确认任务是否提交。请再次点击提交，系统会继续同一次请求。",
      "Task submission could not be confirmed. Submit again to continue the same request.",
    ],
  "Task created, but its page could not be opened. Use the task link below.": [
    "任务已创建，但未能自动打开。请使用任务链接。",
    "Task created, but its page could not be opened. Use the task link.",
  ],
  "Pocket–molecule joint retrieval": [
    "口袋–分子联合检索",
    "Pocket–molecule joint retrieval",
  ],
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
export function researchError(
  message: string,
  zh: boolean,
  context: "current" | "historical-task" = "current",
) {
  if (
    /cleanup\/cancellation is unconfirmed|container (?:cancellation|removal) (?:is unconfirmed|could not be confirmed)|Recovery could not confirm task cancellation/i.test(
      message,
    )
  ) {
    if (context === "historical-task")
      return zh
        ? "这次任务曾因收尾未获确认而结束。已有文件仍可查看，请核对计算服务当前状态后重试。"
        : "This task ended while cleanup was unconfirmed. Existing files remain accessible; check the compute service's current status before retrying.";
    return zh
      ? "任务收尾尚未确认，计算队列已暂停。已有任务文件已保留，请在运行状态恢复后重试。"
      : "Task cleanup is not confirmed and the compute queue is paused. Existing task files are retained; retry after the task service recovers.";
  }
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
