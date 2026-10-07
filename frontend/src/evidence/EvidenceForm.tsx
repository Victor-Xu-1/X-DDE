import type { Language } from "../types";
import { GuidedSteps } from "../guided/Questionnaire";
import { useExample } from "../examples/context";
import type { EvidenceDocument } from "./types";
import { useEvidenceDraft } from "./useEvidenceDraft";
import {
  EvidenceSourceQuestion,
  EvidenceConditionsQuestion,
} from "./EvidenceInputQuestions";
import {
  EvidencePreviewQuestion,
  EvidenceConfirmQuestion,
} from "./EvidenceReviewQuestions";
import { EvidenceResults } from "./EvidenceResults";
import "./evidence.css";
export function EvidenceForm({ language }: { language: Language }) {
  const example = useExample(),
    initial =
      example?.record?.kind === "experimental.evidence"
        ? example.record.value.request
        : undefined;
  const d = useEvidenceDraft(language, initial);
  return (
    <GuidedSteps<EvidenceDocument>
      language={language}
      busy={d.busy}
      error={d.error}
      ready={true}
      submitLabel={d.zh ? "保存实验记录" : "Save experimental evidence"}
      onSubmit={d.save}
      renderResult={(value) => (
        <EvidenceResults value={value} language={language} />
      )}
      steps={[
        {
          title: d.zh ? "上传实验表格" : "Upload experimental table",
          valid: Boolean(
            d.asset && d.columns.compound && d.columns.value && !d.loading,
          ),
          content: <EvidenceSourceQuestion draft={d} />,
        },
        {
          title: d.zh ? "说明实验条件" : "Define assay conditions",
          valid: Boolean(
            d.endpoint &&
            d.unit &&
            d.conditions.target.trim() &&
            d.conditions.assay.trim() &&
            d.citation.trim(),
          ),
          content: <EvidenceConditionsQuestion draft={d} />,
        },
        {
          title: d.zh ? "检查数据与关联" : "Review data and links",
          valid: d.checked,
          content: <EvidencePreviewQuestion draft={d} />,
        },
        {
          title: d.zh ? "确认保存" : "Confirm import",
          valid: d.checked && d.valid,
          content: <EvidenceConfirmQuestion draft={d} />,
        },
      ]}
    />
  );
}
