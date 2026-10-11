import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { MoleculeImage } from "./MoleculeImage";
import { ResearchTabs } from "./ResearchTabs";
import type { DepictionSource } from "./depiction-renderer";
import { PoseSession, usePoseSession } from "../viewer/PoseSession";
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
  const frame = {
    urls: urls ?? [],
    records,
    nativeScore,
    comparison: false,
    molecularSource:
      source && "url" in source
        ? source
        : urls?.length === 1 || focusModel !== undefined
          ? {
              url: urls?.[focusModel ?? 0] ?? "",
              record: records?.[focusModel ?? 0] ?? 0,
            }
          : undefined,
  };
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
      <StructureViewer {...frame} language={language} focusModel={focusModel} />
    ),
  };
  return (
    <PoseSession frame={frame}>
      <section
        className="molecular-preview"
        aria-label={zh ? "分子结构预览" : "Molecular structure preview"}
      >
        <PoseViewTabs
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
    </PoseSession>
  );
}

function PoseViewTabs(props: Parameters<typeof ResearchTabs>[0]) {
  const session = usePoseSession();
  return (
    <ResearchTabs
      {...props}
      active={session?.view}
      onChange={session?.chooseView}
    />
  );
}
