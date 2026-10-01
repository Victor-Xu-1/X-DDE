import { useState } from "react";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { qualityDefaults } from "./generated";
import type { QualityProfile } from "./types";

export function QualityForm({
  language,
  onCreated,
  initialMolecule = null,
  initialProtein = null,
}: {
  language: Language;
  onCreated(job: Job): void;
  initialMolecule?: MoleculeRef | null;
  initialProtein?: MoleculeRef | null;
}) {
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    availability = useTaskReadiness("posebusters.check");
  const [molecule, setMolecule] = useState<MoleculeRef | null>(initialMolecule),
    [protein, setProtein] = useState<MoleculeRef | null>(initialProtein),
    [reference, setReference] = useState<MoleculeRef | null>(null);
  const [profile, setProfile] = useState<QualityProfile>(
      initialProtein ? "dock" : "mol",
    ),
    [confirmed, setConfirmed] = useState(false),
    [cpu, setCPU] = useState(1),
    [name, setName] = useState("");
  const options = { ...qualityDefaults, profile, cpu };
  const contextValid =
    profile === "mol" ||
    Boolean(protein && confirmed && (profile !== "redock" || reference));
  return (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy}
      error={run.error || availability.error}
      unavailable={
        zh
          ? "请在安装与组件中部署独立 PoseBusters 环境。"
          : "Install the independent PoseBusters environment in Installation & components."
      }
      submitLabel={zh ? "开始质控" : "Check pose quality"}
      onSubmit={() =>
        run.submit({
          operation: "pose_quality",
          name:
            name.trim() ||
            (zh ? "构象与姿势质控" : "Conformation and pose quality"),
          molecule: molecule!,
          protein: profile === "mol" ? null : protein,
          reference: profile === "redock" ? reference : null,
          coordinate_basis: profile === "mol" ? null : "user_confirmed",
          scientific_inputs: [
            molecule!,
            ...(profile !== "mol" && protein ? [protein] : []),
            ...(profile === "redock" && reference ? [reference] : []),
          ],
          options,
        })
      }
      steps={[
        {
          title: zh ? "选择三维分子" : "Choose a 3D molecule",
          valid: Boolean(molecule),
          content: (
            <ReferencePicker
              kind="ligand"
              value={molecule}
              onChange={(value) => {
                setMolecule(value);
                setConfirmed(false);
              }}
              language={language}
              label={zh ? "检查哪个分子版本？" : "Which molecular version?"}
            />
          ),
        },
        {
          title: zh ? "选择检查用途" : "Choose the check",
          valid: true,
          content: (
            <ChoiceCards<QualityProfile>
              label={zh ? "想检查什么？" : "What should be checked?"}
              value={profile}
              onChange={(value) => {
                setProfile(value);
                setConfirmed(false);
              }}
              options={[
                {
                  value: "mol",
                  title: zh ? "分子三维构象" : "Molecular conformation",
                  note: zh
                    ? "检查化学结构、键长、键角和内部碰撞。"
                    : "Chemical validity, bond geometry and internal clashes.",
                },
                {
                  value: "dock",
                  title: zh ? "蛋白内的结合姿势" : "Pose within a protein",
                  note: zh
                    ? "再检查与蛋白、辅因子和结构水的碰撞。"
                    : "Also check clashes with the protein, cofactors and waters.",
                },
                {
                  value: "redock",
                  title: zh
                    ? "与实验参考姿势比较"
                    : "Compare with an experimental pose",
                  note: zh
                    ? "适用于同一分子和对应受体的重对接复核。"
                    : "For the same molecule redocked into its cognate receptor.",
                },
              ]}
            />
          ),
        },
        {
          title: zh ? "确认条件" : "Confirm the context",
          valid: contextValid,
          content: (
            <>
              {profile !== "mol" && (
                <>
                  <ReferencePicker
                    kind="structure"
                    value={protein}
                    onChange={(value) => {
                      setProtein(value);
                      setConfirmed(false);
                    }}
                    language={language}
                    label={
                      zh
                        ? "对应的 PDB 蛋白版本"
                        : "Matching PDB protein version"
                    }
                  />
                  {profile === "redock" && (
                    <ReferencePicker
                      kind="ligand"
                      value={reference}
                      onChange={(value) => {
                        setReference(value);
                        setConfirmed(false);
                      }}
                      language={language}
                      label={
                        zh
                          ? "同一分子的实验参考姿势"
                          : "Experimental reference pose of the same molecule"
                      }
                    />
                  )}
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    {zh
                      ? "这些分子姿势与所选蛋白处于同一坐标系"
                      : "These poses share the selected protein coordinate frame"}
                  </label>
                </>
              )}
              <Hint
                label={
                  zh ? "需要先做哪些准备？" : "What preparation is required?"
                }
              >
                {zh
                  ? "使用真正的三维分子。蛋白只支持已明确模型、链和替代位置的 PDB；可先用结构准备处理。质控不会移动、修补或重新对接输入。"
                  : "Use a genuine 3D molecule. Prepare one explicit PDB receptor model with resolved alternate locations. Quality checking does not move, repair or redock inputs."}
              </Hint>
              <details>
                <summary>{zh ? "专家微调" : "Expert settings"}</summary>
                <label className="field">
                  CPU
                  <select
                    value={cpu}
                    onChange={(e) => setCPU(Number(e.target.value))}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <label className="field">
                  {zh ? "任务名称（可选）" : "Task name (optional)"}
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </details>
            </>
          ),
        },
        {
          title: zh ? "确认质控" : "Review quality check",
          valid: Boolean(molecule) && contextValid,
          content: (
            <>
              <dl className="questionnaire-review">
                <dt>{zh ? "分子版本" : "Molecule version"}</dt>
                <dd>
                  {molecule?.version_id ?? molecule?.asset_id} · #
                  {(molecule?.record ?? 0) + 1}
                </dd>
                <dt>{zh ? "检查方案" : "Profile"}</dt>
                <dd>PoseBusters 0.6.5 · {profile}</dd>
                <dt>{zh ? "原始结构" : "Original structures"}</dt>
                <dd>{zh ? "保持原样" : "Remain unchanged"}</dd>
              </dl>
              <Hint
                label={zh ? "质控通过代表什么？" : "What does a pass mean?"}
              >
                {zh
                  ? "仅说明通过了本工具的适用几何检查。不能证明结合亲和力、选择性、活性或实验有效性；未能计算的项目不会算作通过。"
                  : "Only passing the applicable plausibility checks, not proof of affinity, selectivity, activity or experimental validity. Missing checks never count as passes."}
              </Hint>
            </>
          ),
        },
      ]}
    />
  );
}
