import { artifactUrl } from "../api";
import { ResearchTable } from "../presentation/ResearchTable";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { NativeResult } from "./types";

export const interactionNames: Record<string, [string, string]> = {
  hydrogen_bond: ["氢键", "Hydrogen bond"],
  hydrophobic: ["疏水作用", "Hydrophobic contact"],
  salt_bridge: ["盐桥", "Salt bridge"],
  pi_stack: ["π 堆积", "π stacking"],
  pi_cation: ["阳离子–π", "Cation–π"],
  halogen_bond: ["卤键", "Halogen bond"],
  water_bridge: ["水桥", "Water bridge"],
  metal_complex: ["金属配位", "Metal coordination"],
};
export function InteractionResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: NativeResult;
  language: Language;
}) {
  const zh = language === "zh",
    rows = result.interactions.map((row, index) => ({
      ...row,
      id: String(index),
    }));
  return (
    <div className="results-split">
      <ResearchTable
        language={language}
        title={zh ? "关键相互作用" : "Key interactions"}
        rows={rows}
        rowId={(row) => row.id}
        columns={[
          {
            key: "residue",
            label: zh ? "残基" : "Residue",
            value: (row) => `${row.chain}:${row.residue}${row.number}`,
          },
          {
            key: "type",
            label: zh ? "作用类型" : "Interaction",
            value: (row) =>
              interactionNames[row.kind]?.[zh ? 0 : 1] ?? row.kind,
          },
          {
            key: "distance",
            label: zh ? "端点距离（Å）" : "Endpoint distance (Å)",
            numeric: true,
            value: (row) => row.distance,
            render: (row) => row.distance.toFixed(2),
          },
        ]}
      />
      {result.structure_artifact && (
        <StructureViewer
          urls={[artifactUrl(job.id, result.structure_artifact)]}
          language={language}
          nativeInteractions={result.interactions}
        />
      )}
      <a
        className="secondary-button"
        href={artifactUrl(job.id, "interactions.csv")}
        download
      >
        {zh ? "下载相互作用表" : "Download interaction table"}
      </a>
    </div>
  );
}
