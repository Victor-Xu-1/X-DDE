import { ComparisonMappingStep } from "./ComparisonMappingStep";
import { ComparisonReview } from "./ComparisonReview";
import { useState } from "react";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useExampleTask } from "../examples/context";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { ComparisonSettings } from "./ComparisonSettings";
import { comparisonDefaults } from "./generated";
import { validMappings, type ComparisonOptions } from "./types";
import "./comparison.css";

type Side = "reference" | "moving";
const formats = [".pdb", ".cif"] as const;

export function ComparisonForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    preset = useExampleTask("structure_compare"),
    run = useTaskSubmit(onCreated);
  const readiness = useTaskReadiness("rmsd");
  const [inputs, setInputs] = useState<Record<Side, MoleculeRef | null>>({
    reference: preset?.reference ?? null,
    moving: preset?.moving ?? null,
  });
  const [options, setOptions] = useState<ComparisonOptions>(
    () =>
      preset?.options ?? {
        ...comparisonDefaults,
        target_mapping: [{ reference: "", moving: "" }],
        partner_mapping: [{ reference: "", moving: "" }],
      },
  );
  const [name, setName] = useState(preset?.name ?? "");
  function updateInput(side: Side, value: MoleculeRef | null) {
    setInputs((current) => ({ ...current, [side]: value }));
    setOptions((current) => ({
      ...current,
      target_mapping: current.target_mapping.map((pair) => ({
        ...pair,
        [side]: "",
      })),
      partner_mapping: current.partner_mapping.map((pair) => ({
        ...pair,
        [side]: "",
      })),
    }));
  }
  const mappingValid = validMappings(
    options.target_mapping,
    options.partner_mapping,
  );
  const modelsValid = [options.reference_model, options.moving_model].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 99,
  );
  const settingsValid =
    modelsValid &&
    options.minimum_identity >= 0.5 &&
    options.minimum_identity <= 1 &&
    options.minimum_coverage >= 0.1 &&
    options.minimum_coverage <= 1;
  const materialValid = Boolean(inputs.reference && inputs.moving);
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={run.error || readiness.error}
      ready={readiness.ready}
      onCheckEnvironment={readiness.recheck}
      unavailable={
        zh
          ? "请在安装与运行中升级结构分析环境。"
          : "Upgrade the structural analysis environment in Installation & runtime."
      }
      submitLabel={zh ? "开始结构比较" : "Run structure comparison"}
      onSubmit={async () => {
        if (
          !inputs.reference ||
          !inputs.moving ||
          !mappingValid ||
          !settingsValid
        )
          return;
        return run.submit({
          operation: "structure_compare",
          name:
            name.trim() ||
            (zh
              ? "蛋白界面与构象比较"
              : "Protein interface and conformation comparison"),
          reference: inputs.reference,
          moving: inputs.moving,
          options,
          scientific_inputs: [inputs.reference, inputs.moving],
        });
      }}
      steps={[
        {
          title: zh ? "选择结构" : "Choose structures",
          valid: materialValid,
          content: (
            <>
              {(["reference", "moving"] as const).map((side) => (
                <ReferencePicker
                  key={side}
                  kind="structure"
                  allowedSuffixes={formats}
                  value={inputs[side]}
                  onChange={(value) => updateInput(side, value)}
                  language={language}
                  label={
                    side === "reference"
                      ? zh
                        ? "参照结构"
                        : "Reference structure"
                      : zh
                        ? "要比较的结构"
                        : "Structure to compare"
                  }
                />
              ))}
            </>
          ),
        },
        {
          title: zh ? "对应蛋白链" : "Map protein chains",
          valid: materialValid && mappingValid,
          content: (
            <ComparisonMappingStep
              inputs={inputs}
              options={options}
              language={language}
              onChange={setOptions}
            />
          ),
        },
        {
          title: zh ? "选择比较方式" : "Choose comparison",
          valid: settingsValid,
          content: (
            <>
              <ComparisonSettings
                language={language}
                options={options}
                onChange={setOptions}
              />
              <label className="field">
                {zh ? "任务名称（可选）" : "Task name (optional)"}
                <input
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </>
          ),
        },
        {
          title: zh ? "确认启动" : "Review and run",
          valid: materialValid && mappingValid && settingsValid,
          content: (
            <ComparisonReview
              inputs={inputs}
              options={options}
              language={language}
            />
          ),
        },
      ]}
    />
  );
}
