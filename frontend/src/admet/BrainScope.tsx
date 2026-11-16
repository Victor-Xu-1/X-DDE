import type { Language } from "../types";

export const brainEndpointIds = [
  "BBB_Martins",
  "PAMPA_NCATS",
  "Pgp_Broccatelli",
  "Lipophilicity_AstraZeneca",
  "Solubility_AqSolDB",
  "PPBR_AZ",
  "Caco2_Wang",
] as const;
export const brainEndpoints = new Set<string>(brainEndpointIds);

export function BrainScope({ language }: { language: Language }) {
  const zh = language === "zh";
  return (
    <div className="admet-brain-scope">
      <strong>
        {zh ? "BBB 预测与辅助 ADME 性质" : "BBB prediction and supporting ADME"}
      </strong>
      <p className="field-help">
        {zh
          ? "P-gp 此处是抑制预测，不是底物或外排比；不预测 logBB 或 Kpuu。"
          : "P-gp here predicts inhibition, not substrate status or efflux ratio. No logBB or Kpuu is predicted."}
      </p>
    </div>
  );
}
