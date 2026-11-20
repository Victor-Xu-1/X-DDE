import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { MoleculeImage } from "./MoleculeImage";
import { ResearchTabs } from "./ResearchTabs";

/** Reviews an existing file in the original frame, without preparing a pose. */
export function PredictionSourceMolecule({
  url,
  label,
  language,
}: {
  url: string;
  label: string;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <ResearchTabs
      key={url}
      label={zh ? "配体结构视图" : "Ligand structure views"}
      tabs={[
        {
          id: "2d",
          label: zh ? "二维结构" : "2D structure",
          content: <MoleculeImage source={{ url }} label={label} language={language} />,
        },
        {
          id: "3d",
          label: zh ? "原始三维坐标" : "Source 3D coordinates",
          content: (
            <StructureViewer
              urls={[url]}
              language={language}
              sourceSnapshot
              showWorkspaceControls={false}
            />
          ),
        },
      ]}
    />
  );
}
