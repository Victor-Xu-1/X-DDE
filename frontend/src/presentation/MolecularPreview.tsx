import type { ReactNode } from "react";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { MoleculeImage } from "./MoleculeImage";
import { ResearchTabs, type ResearchTab } from "./ResearchTabs";
import type { DepictionSource } from "./depiction-renderer";
import { PoseSession, usePoseSession } from "../viewer/PoseSession";
export function MolecularPreview({
  language,
  label,
  source,
  urls,
  records,
  nativeScore,
  receptorUrl,
  defaultView = "2d",
  focusModel,
  nativeArtifactSha256,
  nativeArtifactRecord,
  savedAssetSha256,
  sourceSnapshot = false,
  toolbar,
}: {
  language: Language;
  label: string;
  source: DepictionSource | null;
  urls?: string[];
  records?: number[];
  receptorUrl?: string;
  defaultView?: "2d" | "3d";
  focusModel?: number;
  nativeArtifactSha256?: string;
  nativeArtifactRecord?: number;
  /** Whole-file digest for a selected version in the research file workspace. */
  savedAssetSha256?: string;
  sourceSnapshot?: boolean;
  nativeScore?: Parameters<typeof StructureViewer>[0]["nativeScore"];
  toolbar?: ReactNode;
}) {
  const zh = language === "zh";
  const frame = {
    sourceSnapshot,
    urls: urls ?? [],
    records,
    nativeScore,
    nativeArtifactSha256,
    nativeArtifactRecord,
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
    shortLabel: toolbar ? (zh ? "二维" : "2D") : undefined,
    content: (
      <MoleculeImage source={source} label={label} language={language} />
    ),
  };
  const structure = {
    id: "3d",
    label: zh ? "三维结构" : "3D structure",
    shortLabel: toolbar ? (zh ? "三维" : "3D") : undefined,
    content: (
      <MolecularStructureView
        viewer={{
          ...frame,
          language,
          focusModel,
          structureChecksums:
            sourceSnapshot &&
            urls?.length === 1 &&
            source &&
            "url" in source &&
            source.url === urls[0] &&
            source.sha256
              ? [source.sha256]
              : undefined,
        }}
        savedAssetSha256={savedAssetSha256}
      />
    ),
  };
  const tabs: ResearchTab[] = urls?.length
    ? defaultView === "3d"
      ? [structure, drawing]
      : [drawing, structure]
    : [drawing];
  if (receptorUrl) {
    tabs.push({
      id: "receptor",
      label: zh ? "原始受体" : "Original receptor",
      content: (
        <StructureViewer
          urls={[receptorUrl]}
          language={language}
          sourceSnapshot
        />
      ),
    });
  }
  return (
    <PoseSession frame={frame}>
      <section
        className="molecular-preview"
        aria-label={zh ? "分子结构预览" : "Molecular structure preview"}
      >
        <PoseViewTabs
          key={label + JSON.stringify(source)}
          label={zh ? "结构视图" : "Structure views"}
          tabs={tabs}
          toolbar={toolbar}
        />
      </section>
    </PoseSession>
  );
}

function MolecularStructureView({
  viewer,
  savedAssetSha256,
}: {
  viewer: Parameters<typeof StructureViewer>[0];
  savedAssetSha256?: string;
}) {
  const session = usePoseSession();
  if (!savedAssetSha256) return <StructureViewer {...viewer} />;
  const sha256 =
    session?.controller.pose.object?.reference.sha256 ?? savedAssetSha256;
  return (
    <StructureViewer
      {...viewer}
      structureChecksums={[sha256]}
      showWorkspaceControls={false}
    />
  );
}

function PoseViewTabs(props: Parameters<typeof ResearchTabs>[0]) {
  const session = usePoseSession();
  return (
    <ResearchTabs
      key={session?.plan.key}
      {...props}
      active={session?.view}
      onChange={session?.chooseView}
    />
  );
}
