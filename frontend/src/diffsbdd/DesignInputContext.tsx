import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { StructureViewer } from "../viewer/StructureViewer";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { ResearchTabs } from "../presentation/ResearchTabs";

function inputReference(value: unknown): MoleculeRef | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as MoleculeRef;
  return typeof ref.asset_id === "string" &&
    /^[0-9a-f-]{36}$/.test(ref.asset_id) &&
    typeof ref.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(ref.sha256) &&
    Number.isInteger(ref.record) &&
    ref.record >= 0 &&
    ref.conformer === 0
    ? ref
    : null;
}

export function DesignInputContext({
  job,
  language,
}: {
  job: Job;
  language: Language;
}) {
  if (job.request.operation !== "diffsbdd") return null;
  const molecule = inputReference(job.request.payload.molecule),
    protein = inputReference(job.request.payload.protein),
    zh = language === "zh";
  const tabs = [];
  if (molecule) {
    const url = `/api/assets/${molecule.asset_id}`;
    tabs.push({
      id: "molecule",
      label: zh ? "起始分子" : "Starting molecule",
      content: (
        <MolecularPreview
          language={language}
          label={zh ? "任务输入：起始分子" : "Task input: starting molecule"}
          source={{ url, record: molecule.record }}
          urls={[url]}
          records={[molecule.record]}
        />
      ),
    });
  }
  if (protein)
    tabs.push({
      id: "protein",
      label: zh ? "研究受体" : "Input receptor",
      content: (
        <StructureViewer
          language={language}
          urls={[`/api/assets/${protein.asset_id}`]}
          records={[protein.record]}
          initialMode="cartoon"
        />
      ),
    });
  if (!tabs.length) return null;
  return (
    <section
      className="design-input-context"
      aria-label={zh ? "检查研究输入" : "Inspect research inputs"}
    >
      <h3>{zh ? "检查研究输入" : "Inspect research inputs"}</h3>
      <p className="field-help">
        {zh
          ? "下方显示本次任务的输入结构。可检查起始分子或受体，再调整设计方案。"
          : "These are the task's input structures. Inspect the starting molecule or receptor before adjusting the design plan."}
      </p>
      <ResearchTabs label={zh ? "研究输入" : "Research inputs"} tabs={tabs} />
    </section>
  );
}
