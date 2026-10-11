import type { Language } from "../types";
import type { InputCatalog } from "./input-catalog";
import "./history-file-controls.css";
export function HistoryFileControls({
  language,
  query,
  page,
  data,
  loading,
  onQuery,
  onPage,
}: {
  language: Language;
  query: string;
  page: number;
  data: InputCatalog | null;
  loading: boolean;
  onQuery(query: string): void;
  onPage(page: number): void;
}) {
  const zh = language === "zh";
  return (
    <div className="historical-file-controls">
      <label className="field">
        {zh ? "查找历史材料" : "Find historical inputs"}
        <input
          type="search"
          value={query}
          maxLength={180}
          placeholder={zh ? "文件名或研究结果名称" : "File name or result name"}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      {data && (
        <nav aria-label={zh ? "历史材料分页" : "Historical input pages"}>
          <span>
            {data.total ? data.offset + 1 : 0}–
            {Math.min(data.total, data.offset + data.limit)} / {data.total}
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || page === 0}
            onClick={() => onPage(page - 1)}
          >
            {zh ? "上一页" : "Previous"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || data.offset + data.limit >= data.total}
            onClick={() => onPage(page + 1)}
          >
            {zh ? "下一页" : "Next"}
          </button>
        </nav>
      )}
      {data?.total === 0 && (
        <p role="status">
          {zh ? "没有匹配的历史材料" : "No matching historical inputs"}
        </p>
      )}
    </div>
  );
}
