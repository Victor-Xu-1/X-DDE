import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import type { DatasetSource } from "./types";

const prerequisites: Partial<
  Record<DatasetSource["role"], [ToolId, string, string]>
> = {
  definition: ["del.library", "核实 DEL 库定义", "Validate a DEL library"],
  decoded: ["del.decode", "解码测序文件", "Decode sequencing files"],
  counts: ["del.count", "生成 UMI 与计数结果", "Prepare UMI counts"],
  analysis: ["del.analyze", "分析 DEL 富集与命中", "Analyze DEL enrichment"],
  model: ["del.model", "建立 DEL 研究模型", "Train a DEL research model"],
};

export function DELPrerequisite({
  role,
  language,
  onPrepare,
}: {
  role: DatasetSource["role"];
  language: Language;
  onPrepare?(tool: ToolId): void;
}) {
  const choice = prerequisites[role],
    zh = language === "zh";
  if (!choice) return null;
  const [tool, cn, en] = choice;
  return (
    <div className="research-prerequisite">
      <p>
        {zh
          ? `还没有可选择的结果，请先${cn}。`
          : `No result is available yet. First: ${en.toLowerCase()}.`}
      </p>
      {onPrepare && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => onPrepare(tool)}
        >
          {zh ? cn : en}
        </button>
      )}
    </div>
  );
}
