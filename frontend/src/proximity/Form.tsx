import { Questionnaire } from "../guided/Questionnaire";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { PartnerQuestion } from "./PartnerQuestion";
import { useProximityDraft } from "./useProximityDraft";
import { InitialMaterials } from "./InitialMaterials";
import { ProximityPlan } from "./Plan";
import { partnerRoles } from "./types";
import type { Job, Language } from "../types";
import type { ScientificTask } from "../integrations/types";
import "./proximity.css";

export function ProximityForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    draft = useProximityDraft(language);
  const {
    ligand,
    first,
    second,
    armA,
    armB,
    binary,
    firstReady,
    secondReady,
    planReady,
    payload,
    setPayload,
    onLigand,
  } = draft;
  const roles = partnerRoles(payload.mechanism, zh);
  const run = useTaskSubmit(onCreated),
    readiness = useTaskReadiness("deepternary.model");
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      ready={readiness.ready}
      error={run.error || readiness.error}
      unavailable={
        zh
          ? "请在安装与组件中配置三元建模环境。"
          : "Configure the ternary-modeling environment in Components."
      }
      submitLabel={zh ? "开始三元建模" : "Start ternary modeling"}
      onSubmit={() => {
        const inputs: ScientificTask["inputs"] = [
          { role: "ligand", source: ligand! },
          { role: "partner_a", source: first! },
          { role: "partner_b", source: second! },
          ...(binary
            ? [
                { role: "arm_a" as const, source: armA! },
                { role: "arm_b" as const, source: armB! },
              ]
            : []),
        ];
        return run.submit({
          operation: "ternary_model",
          name: zh
            ? "诱导邻近 · 三元装配探索"
            : "Induced proximity · ternary assemblies",
          inputs,
          scientific_inputs: inputs.map((i) => i.source),
          payload,
          options: { device: "cpu", cpu: 2, memory_mib: 6144, seed: 31 },
        });
      }}
      steps={[
        {
          title: zh ? "选择分子与目标" : "Choose molecule and mechanism",
          valid: Boolean(ligand),
          content: (
            <InitialMaterials
              payload={payload}
              setPayload={setPayload}
              ligand={ligand}
              setLigand={onLigand}
              language={language}
            />
          ),
        },
        {
          title: roles[0],
          valid: firstReady && Boolean(payload.partner_a_name.trim()),
          content: (
            <PartnerQuestion side="a" draft={draft} language={language} />
          ),
        },
        {
          title: roles[1],
          valid: secondReady && Boolean(payload.partner_b_name.trim()),
          content: (
            <PartnerQuestion side="b" draft={draft} language={language} />
          ),
        },
        {
          title: zh ? "确认探索方案" : "Review exploration",
          valid: Boolean(ligand) && firstReady && secondReady && planReady,
          content: (
            <ProximityPlan
              payload={payload}
              setPayload={setPayload}
              language={language}
            />
          ),
        },
      ]}
    />
  );
}
