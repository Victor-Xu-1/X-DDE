import { useState } from "react";
import { artifactUrl } from "../api";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { SdfArtifactDownload } from "../presentation/SdfArtifactDownload";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { usePoseSession } from "../viewer/PoseSession";
import { PoseStudyInput } from "../viewer/PoseStudyInput";
import { StateInspectionTables } from "./StateInspectionTables";
import { StateResultNotes } from "./StateResultNotes";
import { stateReferences, stateSelection } from "./state-inspection";
import type { StateResult, StateSet } from "./types";

export function StateCollectionPreview({
  job,
  data,
  sets,
  language,
  onUse,
  stateIndex,
  record,
  onSelection,
}: {
  job: Job;
  data: StateResult;
  sets: StateSet[];
  language: Language;
  onUse(reference: MoleculeRef, kind: "properties" | "docking"): void;
  stateIndex: number | undefined;
  record: number | null;
  onSelection(state: number, record: number | null): void;
}) {
  const zh = language === "zh";
  const [toolsOpen, setToolsOpen] = useState(false);
  const view = usePoseSession()?.view;
  const selection = stateSelection(data, stateIndex, record);
  const { state, conformers, conformer, nativeConformer } = selection;
  const notes = (
    <StateResultNotes jobId={job.id} data={data} language={language} />
  );
  if (!state) return notes;
  const { stateRef, conformerRef } = stateReferences(
    data,
    sets,
    job.id,
    selection,
  );
  const original = nativeConformer ? conformerRef : stateRef;
  const url = nativeConformer
    ? artifactUrl(job.id, nativeConformer.artifact)
    : undefined;
  return (
    <section className="state-collection-preview">
      <StructureWorkbench
        preview={
          <div
            className="state-native-preview"
            data-tools={toolsOpen ? "open" : "closed"}
          >
            <div className="state-preview-controls">
              <label>
                <span>{zh ? "状态" : "State"}</span>
                <select
                  aria-label={zh ? "化学状态" : "Chemical state"}
                  value={state.index}
                  onChange={(event) =>
                    onSelection(Number(event.currentTarget.value), null)
                  }
                >
                  {data.states.map((item) => (
                    <option key={item.index} value={item.index}>
                      {item.index + 1} / {data.states.length}
                    </option>
                  ))}
                </select>
              </label>
              {conformer && (
                <label>
                  <span>{zh ? "构象" : "Conformer"}</span>
                  <select
                    aria-label={zh ? "游离构象" : "Free conformer"}
                    value={conformer.record}
                    onChange={(event) =>
                      onSelection(
                        state.index,
                        Number(event.currentTarget.value),
                      )
                    }
                  >
                    {conformers.map((item) => (
                      <option key={item.record} value={item.record}>
                        {item.native_conformer + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {url && view !== "2d" && (
                <button
                  className="secondary-button state-view-tools"
                  type="button"
                  aria-expanded={toolsOpen}
                  onClick={() => setToolsOpen((open) => !open)}
                >
                  {zh ? "视图工具" : "View tools"}
                </button>
              )}
            </div>
            <MolecularPreview
              label={String(state.index + 1)}
              language={language}
              source={{
                url: url ?? artifactUrl(job.id, data.state_artifact),
                record: url ? 0 : state.index,
                sha256:
                  nativeConformer?.artifact_sha256 ??
                  data.artifact_sha256[data.state_artifact],
              }}
              defaultView={url ? "3d" : "2d"}
              urls={url ? [url] : undefined}
              records={url ? [0] : undefined}
              nativeArtifactSha256={nativeConformer?.artifact_sha256}
            />
            {conformer && !nativeConformer && (
              <p className="field-help" role="status">
                {zh
                  ? "此构象缺少可核验的三维文件，已显示原始化学状态。"
                  : "This conformer has no verifiable 3D file. Showing the original chemical state."}
              </p>
            )}
            {url && nativeConformer && (
              <SdfArtifactDownload
                key={url + ":" + nativeConformer.artifact_sha256}
                className="state-conformer-download"
                url={url}
                sha256={nativeConformer.artifact_sha256}
                filename={nativeConformer.artifact}
                language={language}
                label={
                  zh
                    ? "下载所选原始构象 SDF"
                    : "Download selected original conformer SDF"
                }
                errorLabel={
                  zh
                    ? "无法核对原始构象。请重试。"
                    : "Could not verify the original conformer. Try again."
                }
              />
            )}
            {original && (
              <PoseStudyInput original={original} language={language}>
                {(input) => (
                  <div className="editor-toolbar">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!input?.ready}
                      onClick={() => {
                        if (input) onUse(input.reference, "properties");
                      }}
                    >
                      {zh
                        ? "计算此状态性质"
                        : "Calculate this state's properties"}
                    </button>
                    {conformerRef && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!input?.ready}
                        onClick={() => {
                          if (input) onUse(input.reference, "docking");
                        }}
                      >
                        {zh
                          ? "用于寻找结合姿势"
                          : "Use for binding-pose search"}
                      </button>
                    )}
                  </div>
                )}
              </PoseStudyInput>
            )}
          </div>
        }
      >
        <StateInspectionTables
          jobId={job.id}
          data={data}
          language={language}
          state={state}
          conformers={conformers}
          selected={conformer}
          onSelection={onSelection}
        />
        {notes}
      </StructureWorkbench>
    </section>
  );
}
