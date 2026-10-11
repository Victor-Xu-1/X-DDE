import { HistoryFileControls } from "../research/HistoryFileControls";
import type { InputCatalog } from "../research/input-catalog";
import type { Asset } from "./types";
import type { Language } from "../types";
import { historyChoiceLabel, nameCounts } from "../presentation/history-choice";
export function AssetHistorySelect({
  language,
  label,
  value,
  data,
  selected,
  loading,
  query,
  page,
  onQuery,
  onPage,
  onSelect,
}: {
  language: Language;
  label: string;
  value: string;
  data: InputCatalog | null;
  selected: Asset | null;
  loading: boolean;
  query: string;
  page: number;
  onQuery(value: string): void;
  onPage(value: number): void;
  onSelect(asset: Asset | null): void;
}) {
  const zh = language === "zh",
    files = data?.items.map((item) => item.asset) ?? [],
    counts = nameCounts(files.map((file) => file.name));
  return (
    <>
      <HistoryFileControls
        language={language}
        query={query}
        page={page}
        data={data}
        loading={loading}
        onQuery={onQuery}
        onPage={onPage}
      />
      <label className="field">
        <span className="sr-only">{label}</span>
        <select
          value={value}
          disabled={loading}
          onChange={(event) =>
            onSelect(
              files.find((file) => file.id === event.target.value) ??
                (selected?.id === event.target.value ? selected : null),
            )
          }
        >
          <option value="">
            {zh ? "选择历史文件" : "Choose a historical file"}
          </option>
          {files.map((file, index) => (
            <option key={file.id} value={file.id}>
              {(counts.get(file.name) ?? 0) > 1
                ? historyChoiceLabel(file.name, index, zh, file.created_at)
                : file.name}
            </option>
          ))}
          {value && !files.some((file) => file.id === value) && (
            <option value={value}>
              {zh ? "当前选择：" : "Current selection: "}
              {selected?.name ?? (zh ? "已选择的文件" : "Selected file")}
            </option>
          )}
        </select>
      </label>
    </>
  );
}
