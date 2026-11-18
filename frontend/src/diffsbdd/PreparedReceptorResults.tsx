import { artifactUrl } from "../api";
import type { OperationResult } from "../operations/types";
import { PreparedStructureWorkspace } from "../receptors/PreparedStructureWorkspace";
import type { Language } from "../types";

/** The historical preparation report records counts and an output filename, but no output digest. */
export function PreparedReceptorResults({
  jobId,
  data,
  language,
}: {
  jobId: string;
  data: OperationResult;
  language: Language;
}) {
  const zh = language === "zh";
  const artifact =
    typeof data.structure === "string" && data.structure.trim()
      ? artifactUrl(jobId, data.structure)
      : undefined;
  const metrics = (
    [
      ["output_atoms", zh ? "保留原子" : "Retained atoms"],
      ["input_atoms", zh ? "原始原子" : "Input atoms"],
      ["removed_atoms", zh ? "移除原子" : "Removed atoms"],
    ] as const
  ).flatMap(([key, label]) => {
    const value = data[key];
    return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
      ? [{ label, value }]
      : [];
  });
  return (
    <PreparedStructureWorkspace
      language={language}
      artifact={artifact}
      metrics={metrics}
    >
      {data.notes && (
        <details className="result-method-notes">
          <summary>{zh ? "方法与结果范围" : "Method & result scope"}</summary>
          <p>{data.notes}</p>
        </details>
      )}
    </PreparedStructureWorkspace>
  );
}
