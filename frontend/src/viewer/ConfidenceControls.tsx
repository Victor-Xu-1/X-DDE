import type { Language } from "../types";
import { confidenceColors } from "./confidence-types";
import "./confidence-controls.css";
export function ConfidenceControls({
  language,
  ready,
  color,
  onColor,
}: {
  language: Language;
  ready: boolean;
  color: "chain" | "confidence";
  onColor(value: "chain" | "confidence"): void;
}) {
  const zh = language === "zh";
  return (
    <label className="confidence-color-control">
      <span>{zh ? "着色" : "Color by"}</span>
      <select
        aria-label={zh ? "结构着色" : "Structure coloring"}
        value={color}
        onChange={(e) => onColor(e.target.value as "chain" | "confidence")}
      >
        <option value="chain">{zh ? "链" : "Chain"}</option>
        <option value="confidence" disabled={!ready}>
          {zh ? "置信度" : "Confidence"}
        </option>
      </select>
    </label>
  );
}
export function ConfidenceLegend({ language }: { language: Language }) {
  const zh = language === "zh";
  return (
    <div
      className="confidence-legend"
      aria-label={zh ? "置信度色标" : "Confidence legend"}
    >
      {[...confidenceColors].reverse().map((color, i) => (
        <span key={color}>
          <i style={{ background: color }} />
          {["> 90", "70–90", "50–70", "< 50"][i]}
        </span>
      ))}
      <span>
        pLDDT · {zh ? "聚合物模型置信度" : "Polymer model confidence"}
      </span>
    </div>
  );
}
