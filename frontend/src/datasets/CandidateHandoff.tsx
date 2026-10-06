import { useState, type ReactNode } from "react";
import type { Job, Language } from "../types";
import type { DatasetCandidate } from "./types";
import { usePoseAssets } from "../docking/usePoseAssets";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { AdmetForm } from "../admet/AdmetForm";
import { QualityForm } from "../quality/QualityForm";
import { DockingForm } from "../docking/DockingForm";
import { LibraryScreenForm } from "../chemistry/LibraryScreenForm";
import { Editors } from "../editors/Editors";
import { useDeployment } from "../deployment/client";
import { ScientificForm } from "../integrations/ScientificForm";
import { DeploymentPanel } from "../deployment/DeploymentPanel";

type Action =
  | "interactions"
  | "admet"
  | "quality"
  | "dock"
  | "score"
  | "minimize"
  | "edit"
  | "curate";
function EditCandidate(props: {
  job: Job;
  language: Language;
  object: NonNullable<ReturnType<typeof usePoseAssets>["versions"][number]>;
  onCreated(job: Job): void;
}) {
  const deployment = useDeployment();
  const [setup, setSetup] = useState(false);
  if (setup)
    return (
      <>
        <button type="button" onClick={() => setSetup(false)}>
          {props.language === "zh"
            ? "← 返回分子编辑"
            : "← Back to molecule editing"}
        </button>
        <DeploymentPanel
          data={deployment.data}
          error={deployment.error}
          refresh={deployment.refresh}
          language={props.language}
        />
      </>
    );
  return (
    <Editors
      language={props.language}
      deployment={deployment.data}
      deploymentError={deployment.error}
      onRetry={deployment.refresh}
      onSetup={() => setSetup(true)}
      initialObject={props.object}
      onCreated={props.onCreated}
    />
  );
}
export function CandidateHandoff({
  job,
  candidate,
  language,
  onCreated,
  children,
}: {
  job: Job;
  candidate: DatasetCandidate | undefined;
  language: Language;
  onCreated?(job: Job): void;
  children: ReactNode;
}) {
  const zh = language === "zh",
    assets = usePoseAssets(job.id),
    [action, setAction] = useState<Action | null>(null),
    [notice, setNotice] = useState("");
  const molecule = assets.versions.find(
      (v) =>
        v.kind === "molecule" &&
        v.reference.record === candidate?.record &&
        (v.label === candidate?.artifact ||
          v.label.startsWith(candidate?.artifact + " · #")),
    ),
    protein = assets.versions.find(
      (v) => v.kind === "structure" && v.label === "receptor.pdb",
    );
  const complex = assets.versions.find(
    (v) => v.kind === "structure" && v.label === candidate?.complex_artifact,
  );
  function created(value: Job) {
    onCreated?.(value);
    setNotice(zh ? "新研究任务已提交。" : "The new study has been submitted.");
  }
  if (action && molecule)
    return (
      <ResearchHandoff language={language} onBack={() => setAction(null)}>
        {action === "interactions" ? (
          complex ? (
            <ScientificForm
              form="plip.profile"
              language={language}
              initialStructure={complex.reference}
              onCreated={created}
            />
          ) : null
        ) : action === "admet" ? (
          <AdmetForm
            language={language}
            initialMolecule={molecule.reference}
            onCreated={created}
          />
        ) : action === "quality" ? (
          <QualityForm
            language={language}
            initialMolecule={molecule.reference}
            initialProtein={
              candidate?.geometry === "binding_pose" ? protein?.reference : null
            }
            onCreated={created}
          />
        ) : action === "edit" ? (
          <EditCandidate
            job={job}
            object={molecule}
            language={language}
            onCreated={created}
          />
        ) : action === "curate" ? (
          <LibraryScreenForm
            language={language}
            initialLibrary={molecule.reference}
            onCreated={created}
          />
        ) : (
          <DockingForm
            mode={action}
            language={language}
            initialLigand={molecule.reference}
            initialReceptor={protein?.reference ?? null}
            onCreated={created}
          />
        )}
      </ResearchHandoff>
    );
  return (
    <>
      {children}
      <div className="dataset-continuation">
        <span>{zh ? "继续研究" : "Continue research"}</span>
        {molecule ? (
          <>
            {(["admet", "quality", "dock", "edit", "curate"] as const).map(
              (value, index) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setAction(value)}
                >
                  {
                    (zh
                      ? [
                          "性质与早期安全性",
                          "构象与姿势质控",
                          "继续对接",
                          "编辑当前分子",
                          "整理候选集合",
                        ]
                      : [
                          "ADMET predictions",
                          "Pose quality",
                          "Dock molecule",
                          "Edit molecule",
                          "Curate candidate set",
                        ])[index]
                  }
                </button>
              ),
            )}
            {candidate?.geometry === "binding_pose" && protein && (
              <>
                <button type="button" onClick={() => setAction("score")}>
                  {zh ? "重新评分" : "Rescore"}
                </button>
                <button type="button" onClick={() => setAction("minimize")}>
                  {zh ? "优化结合姿势" : "Refine pose"}
                </button>
              </>
            )}
            {complex && (
              <button type="button" onClick={() => setAction("interactions")}>
                {zh ? "化学相互作用分析" : "Chemical interactions"}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={assets.busy || !candidate?.artifact}
            onClick={() => void assets.refresh()}
          >
            {zh ? "准备当前候选供后续研究" : "Register candidate for follow-up"}
          </button>
        )}
      </div>
      {assets.error && <p role="alert">{assets.error}</p>}
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
