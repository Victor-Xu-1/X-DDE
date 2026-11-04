import {
  PredictionJobReview,
  type PredictionJobReviewActions,
} from "../presentation/PredictionJobReview";
import { researchError } from "../presentation/research-content";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { assetDownloadUrl } from "../research/asset-download";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { DiffReview } from "./DiffReview";
import { referenceKey } from "./model";
import {
  prepareSpatialDesign,
  type CorePreviewSource,
  type SpatialDesignReviewInput,
} from "./spatial-design-review";
import type { DiffTask, Pocket } from "./types";
import "./spatial-design-review.css";

export function SpatialDesignJobReview({
  corePreview,
  taskLabel,
  ...props
}: PredictionJobReviewActions<DiffTask> & {
  input: SpatialDesignReviewInput;
  corePreview: CorePreviewSource | null;
  taskLabel: string;
}) {
  const { language } = props,
    zh = language === "zh";
  return (
    <PredictionJobReview
      {...props}
      wide
      prepare={prepareSpatialDesign}
      preparationError={(error) => researchError(error, zh)}
      summary={() => `DiffSBDD · ${taskLabel}`}
      renderOverview={(prepared) => (
        <SpatialInputs
          {...prepared}
          corePreview={corePreview ?? prepared.savedCore}
          language={language}
        />
      )}
      renderSettings={(prepared) => (
        <aside
          className="job-review-settings spatial-design-settings"
          aria-label={zh ? "设计方案" : "Design settings"}
        >
          <h3>{zh ? "设计方案" : "Design settings"}</h3>
          <DiffReview
            language={language}
            taskLabel={taskLabel}
            name={prepared.task.name}
            mode={prepared.mode}
            protein={prepared.protein}
            molecule={prepared.initial}
            pocket={prepared.pocket}
            options={prepared.options}
            fixed={prepared.fixed}
            collection={[]}
            chains=""
            removeWater={false}
            keepLigands={false}
            removeH={false}
            preparedSources
          />
        </aside>
      )}
    />
  );
}

function SpatialInputs({
  protein,
  pocket,
  initial,
  fixed,
  corePreview,
  language,
}: {
  protein: MoleculeRef;
  pocket: Pocket;
  initial: MoleculeRef | null;
  fixed: number[];
  corePreview: CorePreviewSource | null;
  language: Language;
}) {
  const zh = language === "zh";
  const pocketTitle = zh ? "受体与口袋" : "Receptor and pocket";
  const ligand = pocket.kind === "ligand" ? pocket.ligand : null;
  const residues =
    pocket.kind === "residues"
      ? pocket.residues
      : pocket.kind === "bound_ligand"
        ? [pocket.residue]
        : undefined;
  const urls = [assetDownloadUrl(protein.asset_id)];
  if (ligand) urls.push(assetDownloadUrl(ligand.asset_id, ligand.record));
  const receptor = (
    <section aria-label={pocketTitle} className="spatial-design-geometry">
      <p className="field-help">
        {ligand
          ? zh
            ? "显示参考配体的原始坐标。叠加不会执行对齐或预测。"
            : "The reference ligand is shown at its original coordinates. This view does not align or predict a pose."
          : zh
            ? "标亮本次提交选定的位置。"
            : "Highlighted positions are the selected pocket inputs."}
      </p>
      <StructureViewer
        urls={urls}
        language={language}
        sourceSnapshot
        focusModel={ligand ? 1 : undefined}
        residueRegion={residues}
      />
    </section>
  );
  if (!initial) return receptor;
  const original = assetDownloadUrl(initial.asset_id, initial.record);
  const confirmedCore =
    corePreview &&
    referenceKey(corePreview.reference) === referenceKey(initial) &&
    fixed.length > 0 &&
    fixed.every((index) => corePreview.selectable.includes(index))
      ? corePreview
      : null;
  const tabs = [
    { id: "pocket", label: pocketTitle, content: receptor },
    {
      id: "initial",
      label: zh ? "起始姿势" : "Starting pose",
      content: (
        <section className="spatial-design-geometry">
          <p className="field-help">
            {confirmedCore
              ? zh
                ? `已标亮 ${fixed.length} 个固定核心原子。`
                : `${fixed.length} fixed core atoms highlighted.`
              : fixed.length
                ? zh
                  ? "查看原始姿势。固定原子编号见右侧，当前视图尚未核对原子映射。"
                  : "Original pose. Fixed atom numbers are listed in the settings; the atom mapping is unverified in this view."
                : zh
                  ? "显示起始分子在所选文件中的坐标。"
                  : "The starting molecule is shown in the selected file's coordinates."}
          </p>
          <StructureViewer
            urls={[confirmedCore?.url ?? original]}
            language={language}
            sourceSnapshot
            selectionMode={confirmedCore ? "atom" : undefined}
            highlightedAtoms={confirmedCore ? fixed : undefined}
          />
        </section>
      ),
    },
    {
      id: "2d",
      label: zh ? "分子二维图" : "Molecule in 2D",
      content: (
        <MoleculeImage
          source={{ url: original }}
          label={zh ? "起始分子" : "Starting molecule"}
          language={language}
        />
      ),
    },
  ];
  return (
    <ResearchTabs label={zh ? "研究结构" : "Research structures"} tabs={tabs} />
  );
}
