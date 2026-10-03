import type { Language } from "../types";
import { modalities, type tools, type ModalityId } from "./catalog";

export function ModalityTags({
  tool,
  language,
}: {
  tool: (typeof tools)[number];
  language: Language;
}) {
  const zh = language === "zh",
    index = zh ? 0 : 1;
  const membership: readonly ModalityId[] = tool.modalities;
  const tags = modalities.filter((item) => membership.includes(item.id));
  const specific = tags.filter(
    (item) => item.id !== "chemical" && item.id !== "biologic",
  );
  return (
    <span
      className="tool-modality-tags"
      aria-label={zh ? "适用范围" : "Applicable scope"}
      title={tags.map((t) => t.label[index]).join(" / ")}
    >
      {tool.modality_role === "shared" ? (
        zh ? (
          "跨药物形式 · 通用工具"
        ) : (
          "Shared across modalities"
        )
      ) : (
        <>
          {tool.modality_role === "target_context" && (
            <span className="modality-context">
              {zh ? "靶标与配套流程" : "Target & supporting workflow"}
            </span>
          )}
          {specific.length > 3 ? (
            <span>{zh ? "多种药物形式" : "Multiple modalities"}</span>
          ) : (
            (specific.length ? specific : tags).map((item) => (
              <span key={item.id} title={item.help[index]}>
                {item.label[index]}
              </span>
            ))
          )}
        </>
      )}
    </span>
  );
}
