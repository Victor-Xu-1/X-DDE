import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { MoleculeImage } from "./MoleculeImage";
import { ResearchTabs } from "./ResearchTabs";
import type { DepictionSource } from "./depiction-renderer";
export function MolecularPreview({
  language,
  label,
  source,
  urls,
  records,
  nativeScore,
  defaultView = "2d",
  focusModel,
}: {
  language: Language;
  label: string;
  source: DepictionSource | null;
  urls?: string[];
  records?: number[];
  defaultView?: "2d" | "3d";
  focusModel?: number;
  nativeScore?: Parameters<typeof StructureViewer>[0]["nativeScore"];
}) {
  const zh = language === "zh";
  const drawing = {
    id: "2d",
    label: zh ? "二维结构" : "2D structure",
    content: (
      <MoleculeImage source={source} label={label} language={language} />
    ),
  };
  const structure = {
    id: "3d",
    label: zh ? "三维结构" : "3D structure",
    content: (
      <StructureViewer
        urls={urls ?? []}
        language={language}
        records={records}
        focusModel={focusModel}
        comparison={false}
        nativeScore={nativeScore}
      />
    ),
  };
  return (
    <section
      className="molecular-preview"
      aria-label={zh ? "分子结构预览" : "Molecular structure preview"}
    >
      <ResearchTabs
        key={label + JSON.stringify(source)}
        label={zh ? "结构视图" : "Structure views"}
        tabs={
          urls?.length
            ? defaultView === "3d"
              ? [structure, drawing]
              : [drawing, structure]
            : [drawing]
        }
      />
    </section>
  );
}
