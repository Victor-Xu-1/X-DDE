import type { Language } from "../types";

/** Describe actual native postprocessing without guessing how many atoms were discarded. */
export function GenerationSummary({
  report,
  language,
}: {
  report: unknown;
  language: Language;
}) {
  if (!report || typeof report !== "object") return null;
  const native = report as {
    settings?: { fragment_policy?: unknown };
    target_atoms?: unknown;
  };
  if (native.settings?.fragment_policy !== "largest") return null;
  const zh = language === "zh";
  const atoms = native.target_atoms;
  const hasTarget =
    typeof atoms === "number" && Number.isSafeInteger(atoms) && atoms > 0;
  return (
    <p
      className="notice"
      role="status"
      aria-label={zh ? "生成片段处理" : "Generation fragment processing"}
    >
      {hasTarget && (
        <strong>
          {zh
            ? `片段处理前的目标大小：${atoms} 个原子。 `
            : `Target size before fragment processing: ${atoms} atoms. `}
        </strong>
      )}
      {zh
        ? "每次采样仅保留最大的连接片段，其余片段可能被去除。请核对实际输出重原子数；输出为单个片段不代表原始采样完整连接。"
        : "Only the largest connected component of each sample is retained; other components may be discarded. Check the output heavy-atom count. A connected output does not establish that the original sample was connected."}
    </p>
  );
}
