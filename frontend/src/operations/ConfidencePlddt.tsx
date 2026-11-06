import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { Language } from "../types";
import type { Confidence } from "./confidence-data";
import type { ConfidenceInspection } from "../viewer/confidence-types";

export function ConfidencePlddt({
  data,
  language,
  inspection,
  onTokens,
}: {
  data: Confidence;
  language: Language;
  inspection?: ConfidenceInspection | null;
  onTokens?(tokens: number[]): void;
}) {
  const zh = language === "zh";
  const points = data?.token_plddt ?? data?.atom_plddt ?? [];
  const tokenConfidence = data?.token_plddt !== undefined;
  const atomScores =
    (tokenConfidence ? data.token_plddt_unit : data.atom_plddt_unit) ===
      "0-1" &&
    points.every(
      (row) => Number.isFinite(row.value) && row.value >= 0 && row.value <= 1,
    )
      ? points.map((row) => 100 * row.value)
      : null;
  return (
    <>
      {points.length > 0 && atomScores !== null && (
        <details open={tokenConfidence}>
          <summary>
            {tokenConfidence
              ? zh
                ? "逐 token 置信度"
                : "Token confidence"
              : zh
                ? "逐原子置信度"
                : "Atom confidence"}
          </summary>
          <InteractivePlot
            title={tokenConfidence ? "Token pLDDT" : "Atom pLDDT"}
            language={language}
            height={220}
            selectable={Boolean(tokenConfidence && inspection && onTokens)}
            onPoint={(point) => {
              const index = Number(point.x);
              if (
                tokenConfidence &&
                inspection &&
                Number.isInteger(index) &&
                index >= 0 &&
                index < inspection.tokens.length
              )
                onTokens?.([index]);
            }}
            data={[
              {
                type: "scatter",
                mode: tokenConfidence ? "lines+markers" : "lines",
                marker: tokenConfidence ? { size: 5, opacity: 0.8 } : undefined,
                x: points.map((row) => row.index),
                y: atomScores,
                name: "pLDDT",
                text: tokenConfidence
                  ? points.map(
                      (point) =>
                        inspection?.tokens[point.index]?.label ??
                        String(point.index),
                    )
                  : undefined,
                hovertemplate: tokenConfidence
                  ? "%{text}<br>pLDDT %{y:.1f}<extra></extra>"
                  : "Atom %{x}<br>pLDDT %{y:.1f}<extra></extra>",
              },
            ]}
            layout={{
              xaxis: {
                title: {
                  text: tokenConfidence
                    ? zh
                      ? "原始 token 索引"
                      : "Native token index"
                    : zh
                      ? "原始原子索引"
                      : "Native atom index",
                },
              },
              yaxis: { title: { text: "pLDDT (0–100)" }, range: [0, 100] },
            }}
          />
          <p className="small">
            {zh ? "显示步长" : "Display stride"}{" "}
            {tokenConfidence ? data.stride : data.atom_stride}
          </p>
        </details>
      )}
      {points.length > 0 && atomScores === null && (
        <p role="status" className="small">
          {zh
            ? tokenConfidence
              ? "逐 token 置信度的数值范围尚无法核验，请下载原生数据查看。"
              : "逐原子置信度的数值范围尚无法核验，请下载原生数据查看。"
            : tokenConfidence
              ? "The token-confidence scale could not be verified. Download the native data to inspect it."
              : "The atom-confidence scale could not be verified. Download the native data to inspect it."}
        </p>
      )}
    </>
  );
}
