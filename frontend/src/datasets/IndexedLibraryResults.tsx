import { useCallback, useState } from "react";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { Hint } from "../guided/Hint";
import { ResearchTable, type TableRow } from "./ResearchTable";
import { useIndexedMember } from "./useIndexedMember";
import { supplierLabel } from "./supplier-label";
import type { Language } from "../types";

export function IndexedLibraryResults({
  jobId,
  language,
}: {
  jobId: string;
  language: Language;
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
  const url = member.saved
    ? `/api/assets/${member.saved.reference.asset_id}`
    : detail?.url;
  return (
    <div className="dataset-indexed-workspace">
      <section>
        <ResearchTable
          jobId={jobId}
          view="index"
          language={language}
          onSelect={setSelected}
          selection={memberId ? [memberId] : []}
          onRowsLoaded={initialize}
        />
      </section>
      <section
        className="dataset-member-inspector"
        aria-label={zh ? "入库分子结构检查" : "Indexed member inspection"}
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
            <header className="dataset-member-heading">
              <h3>{detail.label}</h3>
              <span>{supplierLabel(detail.supplier, zh)}</span>
            </header>
            <div className="dataset-member-actions">
              <span>{zh ? "游离构象" : "Unbound conformer"}</span>
              <Hint label={zh ? "构象说明" : "Conformer help"}>
                {zh
                  ? "显示检索库中实际保存的构象，不代表蛋白结合姿势。保存为历史文件后，可继续最小化、编辑或用于新任务。"
                  : "Shows the actual conformer stored in the index, not a protein-bound pose. Save it as a historical file to refine, edit or use in another task."}
              </Hint>
              <a
                className="secondary-button"
                href={detail.url}
                download="indexed-member.mol"
              >
                {zh ? "原始构象 MOL" : "Original conformer MOL"}
              </a>
              {member.saved ? (
                <span className="dataset-member-saved" role="status">
                  {zh ? "已保存到历史文件" : "Saved to historical files"}
                </span>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={member.phase === "saving"}
                  onClick={() => void member.preserve()}
                >
                  {member.phase === "saving"
                    ? zh
                      ? "正在保存…"
                      : "Saving…"
                    : zh
                      ? "保存为历史文件"
                      : "Save to historical files"}
                </button>
              )}
            </div>
            {member.phase === "error" && (
              <p role="alert">
                {zh
                  ? "保存未完成，可以重试；原始记录保留。"
                  : "Saving did not complete. Retry is available; the original record is retained."}
              </p>
            )}
            <MolecularPreview
              label={detail.label}
              language={language}
              source={{ url: url!, record: 0 }}
              urls={[url!]}
              records={[0]}
              defaultView="3d"
            />
          </>
        )}
      </section>
    </div>
  );
}
