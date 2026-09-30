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
  return (
    <span
      className="tool-modality-tags"
      aria-label={zh ? "适用范围" : "Applicable scope"}
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
          {modalities
            .filter((item) => membership.includes(item.id))
            .map((item) => (
              <span key={item.id} title={item.help[index]}>
                {item.label[index]}
              </span>
            ))}
        </>
      )}
    </span>
  );
}
