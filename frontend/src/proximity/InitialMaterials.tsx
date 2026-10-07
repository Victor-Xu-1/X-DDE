import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { referenceUrl } from "./PartnerStep";
import {
  mechanismLabels,
  type TernaryPayload,
  type ProximityMechanism,
} from "./types";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
export function InitialMaterials({
  payload,
  setPayload,
  ligand,
  setLigand,
  language,
}: {
  payload: TernaryPayload;
  setPayload(value: TernaryPayload): void;
  ligand: MoleculeRef | null;
  setLigand(value: MoleculeRef | null): void;
  language: Language;
}) {
  const zh = language === "zh";
  const notes = {
    protac: zh
      ? "招募 E3 与目标蛋白，探索三元装配。"
      : "Explore target–ligand–E3 assemblies.",
    riptac: zh
      ? "连接靶向端与效应端，探索邻近装配。"
      : "Explore targeting–effector proximity.",
    molecular_glue: zh
      ? "探索小分子介导的两个蛋白界面。"
      : "Explore small-molecule-mediated interfaces.",
    proximity: zh
      ? "按两个真实结合伙伴研究空间可行性。"
      : "Explore the geometry of two binding partners.",
  };
  return (
    <>
      <ChoiceCards<ProximityMechanism>
        label={zh ? "研究哪类分子？" : "Which molecular mechanism?"}
        value={payload.mechanism}
        onChange={(mechanism) =>
          setPayload({
            ...payload,
            mechanism,
            arm_a_map: [],
            arm_b_map: [],
            binding_region_a: [],
            binding_region_b: [],
          })
        }
        options={Object.entries(mechanismLabels).map(([value, label]) => ({
          value: value as ProximityMechanism,
          title: label[zh ? 0 : 1],
          note: notes[value as ProximityMechanism],
        }))}
      />
      <div className="proximity-molecule">
        <ReferencePicker
          kind="ligand"
          value={ligand}
          onChange={setLigand}
          language={language}
          label={
            zh
              ? "完整分子 · 三维 SDF / MOL"
              : "Complete molecule · 3D SDF / MOL"
          }
          allowedSuffixes={[".sdf", ".mol"]}
        />
        {ligand ? (
          <MoleculeImage
            source={{ url: referenceUrl(ligand), record: ligand.record }}
            language={language}
            label={zh ? "完整分子" : "Complete molecule"}
          />
        ) : (
          <div className="proximity-input-empty" aria-hidden="true">
            <span className="proximity-input-symbol">
              A <span>—</span> B
            </span>
            <span>
              {zh
                ? "上传后查看完整结构"
                : "Preview the complete structure after upload"}
            </span>
          </div>
        )}
      </div>
      {payload.mechanism !== "molecular_glue" && (
        <ChoiceCards<"binary_poses" | "shared_complex">
          label={
            zh
              ? "已经有哪些结合结构？"
              : "Which binding structures are available?"
          }
          value={payload.input_mode}
          onChange={(input_mode) =>
            setPayload({
              ...payload,
              input_mode,
              arm_a_map: [],
              arm_b_map: [],
              binding_region_a: [],
              binding_region_b: [],
            })
          }
          options={[
            {
              value: "binary_poses",
              title: zh ? "分别有两端结合姿势" : "Two separate bound poses",
              note: zh
                ? "分别上传蛋白与对应片段；保留各自坐标。"
                : "Upload each protein and its bound fragment in the same coordinates.",
            },
            {
              value: "shared_complex",
              title: zh ? "有完整复合物" : "A complete reference complex",
              note: zh
                ? "选择两条蛋白链，在完整分子上点选两个结合端。"
                : "Choose two chains and both binding regions on the full molecule.",
            },
          ]}
        />
      )}
      <Hint
        label={
          zh ? "没有结合姿势怎么办？" : "What if binding poses are unknown?"
        }
      >
        {zh
          ? "先完成两端的结构预测或对接，再使用确认的结合姿势。这里生成的是装配假设；不能据此认定降解、效应抑制或分子胶活性。"
          : "First predict or dock separate binding poses. These are assembly hypotheses, not evidence of degradation, effector inhibition or molecular-glue activity."}
      </Hint>
    </>
  );
}
