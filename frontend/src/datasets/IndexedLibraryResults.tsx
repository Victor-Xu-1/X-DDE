import {
  DownloadOutlined,
  LoadingOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useCallback, useState, type ReactNode } from "react";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { Hint } from "../guided/Hint";
import { ResearchTable, type TableRow } from "./ResearchTable";
import { useIndexedMember } from "./useIndexedMember";
import { supplierLabel } from "./supplier-label";
import type { Language } from "../types";

export function IndexedLibraryResults({
  jobId,
  language,
  view = "index",
  screeningReview = false,
  compactReview = screeningReview,
  summary,
}: {
  jobId: string;
  language: Language;
  view?: "index" | "library";
  screeningReview?: boolean;
  compactReview?: boolean;
  summary?: ReactNode;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState<TableRow | null>(null);
  const initialize = useCallback(
    (rows: TableRow[]) =>
      setSelected((previous) => previous ?? rows[0] ?? null),
    [],
  );
  const memberId = selected ? String(selected.id) : null;
  const member = useIndexedMember(jobId, memberId),
    detail = member.detail;
  const url =
    member.saved && !screeningReview
      ? `/api/assets/${member.saved.reference.asset_id}`
      : detail?.url;
  const originalLabel =
    detail?.geometry === "unbound_conformer"
      ? zh
        ? "原始构象 MOL"
        : "Original conformer MOL"
      : zh
        ? "原始结构 MOL"
        : "Original structure MOL";
  const saving = member.phase === "saving";
  const saveLabel = zh ? "保存为历史文件" : "Save to historical files";
  const downloadAction = compactReview
    ? zh
      ? "下载 MOL"
      : "Download MOL"
    : originalLabel;
  const SaveIcon = saving ? LoadingOutlined : SaveOutlined;
  const saveAction = saving
    ? zh
      ? "正在保存…"
      : "Saving…"
    : compactReview
      ? zh
        ? "保存文件"
        : "Save file"
      : saveLabel;
  const geometry =
    detail?.geometry === "unbound_conformer"
      ? zh
        ? "游离构象"
        : "Unbound conformer"
      : detail?.geometry === "source_3d"
        ? zh
          ? "原始三维结构"
          : "Original 3D structure"
        : zh
          ? "二维结构"
          : "2D structure";
  const groupSource = compactReview;
  const indexedSource = screeningReview && view === "index";
  const supplier = detail ? supplierLabel(detail.supplier, zh) : "";
  const sourceHelp = indexedSource
    ? zh
      ? "来源与构象"
      : "Source and conformer"
    : zh
      ? "构象说明"
      : "Conformer help";
  const actions = detail && (
    <div className="dataset-member-tools">
      <header className="dataset-member-heading">
        <h3>{detail.label}</h3>
        {groupSource ? (
          <div className="dataset-member-origin">
            <span className="dataset-member-supplier">
              {supplier}
            </span>
            <span>{geometry}</span>
          </div>
        ) : (
          <span>{supplier}</span>
        )}
      </header>
      <div className="dataset-member-actions">
        {!groupSource && <span>{geometry}</span>}
        <Hint label={sourceHelp}>
          {indexedSource && (
            <>
              {zh ? "来源 " : "Source "}
              <strong>{supplier}</strong>
              <br />
            </>
          )}
          {zh
            ? "读取分子库实际保存的记录；二维记录不冒充三维构象，导入的三维坐标也不视为已验证的结合姿势。保存为历史文件后，可继续准备、编辑或用于新任务。"
            : "Reads the actual stored molecular record. A 2D record is not a 3D conformer, and imported 3D coordinates do not establish a validated binding pose. Save a historical file to prepare, edit or use in another task."}
        </Hint>
        <a
          className="secondary-button"
          href={detail.url}
          download={`${detail.label.replace(/[\\/:*?"<>|]/g, "_")}.mol`}
          title={originalLabel}
          aria-label={downloadAction}
        >
          <DownloadOutlined
            className="dataset-member-action-icon"
            aria-hidden="true"
          />
          <span className="dataset-member-action-label">{downloadAction}</span>
        </a>
        {member.saved ? (
          <span className="dataset-member-saved" role="status">
            {zh ? "已保存到历史文件" : "Saved to historical files"}
          </span>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={saving}
            aria-busy={saving || undefined}
            title={saveLabel}
            aria-label={saveAction}
            onClick={() => void member.preserve()}
          >
            <SaveIcon
              className="dataset-member-action-icon"
              aria-hidden="true"
            />
            <span className="dataset-member-action-label">{saveAction}</span>
          </button>
        )}
      </div>
    </div>
  );
  return (
    <StructureWorkbench
      preview={
        <section
          className="dataset-member-inspector"
          data-member-view={view}
          aria-label={zh ? "分子库成员结构检查" : "Library member inspection"}
          aria-busy={Boolean(memberId) && member.phase === "loading"}
        >
          {!memberId ? (
            <p className="dataset-empty">
              {zh ? "选择一个分子查看结构" : "Select a molecule to inspect"}
            </p>
          ) : !detail && member.phase === "loading" ? (
            <p role="status">
              {zh ? "正在读取分子结构…" : "Loading the molecular structure…"}
            </p>
          ) : !detail ? (
            <div role="alert">
              <p>
                {zh
                  ? "这条分子记录暂时无法读取。"
                  : "This molecular record could not be loaded."}
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={member.retry}
              >
                {zh ? "重试" : "Retry"}
              </button>
            </div>
          ) : (
            <>
              {!compactReview && actions}
              {member.phase === "error" && (
                <p role="alert">
                  {zh
                    ? "保存未完成，可以重试；原始记录保留。"
                    : "Saving did not complete. Retry is available; the original record is retained."}
                </p>
              )}
              <MolecularPreview
                label={detail.label}
                toolbar={compactReview ? actions : undefined}
                language={language}
                source={{
                  url: url!,
                  record: 0,
                  sha256: screeningReview ? detail.sha256 : undefined,
                }}
                sourceSnapshot={screeningReview}
                urls={detail.geometry === "source_2d" ? undefined : [url!]}
                records={detail.geometry === "source_2d" ? undefined : [0]}
                defaultView={detail.geometry === "source_2d" ? "2d" : "3d"}
              />
            </>
          )}
        </section>
      }
    >
      <section>
        {summary}
        <ResearchTable
          jobId={jobId}
          view={view}
          showThumbnails={!compactReview}
          language={language}
          onSelect={setSelected}
          selection={memberId ? [memberId] : []}
          onRowsLoaded={initialize}
        />
      </section>
    </StructureWorkbench>
  );
}
