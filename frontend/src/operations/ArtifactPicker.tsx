import { useEffect, useState } from "react";
import type { Language } from "../types";
import type { TaskHistoryItem } from "../studio/task-history-model";
import type { Asset, AssetKind } from "./types";
import { ChoiceCards } from "../guided/ChoiceCards";
import { useTaskHistory } from "../studio/useTaskHistory";
import { ResultTaskSelect } from "./ResultTaskSelect";
import { useResultFiles } from "./useResultFiles";
import { useResultReuse } from "./useResultReuse";
import "./result-source.css";

export function ArtifactPicker({
  kind,
  accept,
  language,
  onSelected,
  onPending,
  maxBytes = 25 * 1024 ** 2,
  currentInput = "",
}: {
  kind: AssetKind;
  accept: string;
  language: Language;
  onSelected(asset: Asset): void;
  onPending?(): void;
  maxBytes?: number;
  currentInput?: string;
}) {
  const zh = language === "zh",
    formats = accept
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  const [scope, setScope] = useState<"research" | "examples">("research"),
    [selected, setSelected] = useState<TaskHistoryItem | null>(null);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [name, setName] = useState("");
  useEffect(() => {
    if (query === search) return;
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);
  const history = useTaskHistory({
    module: null,
    type: "all",
    status: "succeeded",
    query: search,
    page,
    project: null,
    scope,
  });
  useEffect(() => {
    if (history.data && page > 0 && page * 20 >= history.data.total)
      setPage(Math.max(0, Math.ceil(history.data.total / 20) - 1));
  }, [history.data, page]);
  const outputs = useResultFiles(selected?.job.id ?? "", formats, maxBytes);
  const file = outputs.files.find((file) => file.name === name) ?? null;
  const save = useResultReuse(
    selected?.job.id ?? "",
    file,
    kind,
    formats,
    maxBytes,
    onSelected,
    onPending,
    currentInput,
  );
  useEffect(() => {
    setSelected(null);
    setName("");
  }, [kind, accept, maxBytes]);
  function choose(job: TaskHistoryItem | null) {
    save.cancel();
    onPending?.();
    setName("");
    setSelected(job);
  }
  return (
    <section
      className="artifact-picker"
      aria-label={zh ? "选择任务结果" : "Choose a task result"}
    >
      <ChoiceCards<"research" | "examples">
        label={zh ? "结果来源" : "Result source"}
        value={scope}
        onChange={(value) => {
          choose(null);
          setScope(value);
          setQuery("");
          setSearch("");
          setPage(0);
        }}
        options={[
          { value: "research", title: zh ? "研究任务" : "Research tasks" },
          { value: "examples", title: zh ? "示例结果" : "Example results" },
        ]}
      />
      <label className="field result-source-search">
        <span className="sr-only">
          {zh ? "查找已完成任务" : "Find completed tasks"}
        </span>
        <input
          type="search"
          value={query}
          maxLength={180}
          placeholder={zh ? "任务名称或编号" : "Task name or ID"}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ResultTaskSelect
        language={language}
        data={history.data}
        selected={selected}
        scope={scope}
        loading={history.loading}
        page={page}
        onPage={setPage}
        onSelect={choose}
      />
      {history.loading && (
        <p role="status">
          {zh ? "正在读取已完成任务…" : "Loading completed tasks…"}
        </p>
      )}
      {history.data?.total === 0 && (
        <p role="status">
          {zh ? "没有匹配的已完成任务" : "No matching completed tasks"}
        </p>
      )}
      {history.error && (
        <div className="error-box">
          <p role="alert">
            {zh
              ? "暂时无法读取任务，请重试。"
              : "Completed tasks could not be loaded. Try again."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={history.refresh}
          >
            {zh ? "重试任务列表" : "Retry task list"}
          </button>
        </div>
      )}
      {selected && (
        <>
          <label className="field result-source-file">
            {zh ? "结果文件" : "Result file"}
            <select
              value={file?.name ?? ""}
              disabled={outputs.loading}
              onChange={(event) => {
                save.cancel();
                onPending?.();
                setName(event.target.value);
              }}
            >
              <option value="">
                {zh ? "选择结果文件" : "Choose a result file"}
              </option>
              {outputs.files.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
          </label>
          {outputs.loading && (
            <p role="status">
              {zh ? "正在核对结果文件…" : "Checking result files…"}
            </p>
          )}
          {!outputs.loading && !outputs.error && outputs.files.length === 0 && (
            <p role="status">
              {zh
                ? "这个任务没有本模块支持的结果文件。"
                : "This task has no result files supported by this module."}
            </p>
          )}
          {outputs.error && (
            <div className="error-box">
              <p role="alert">
                {zh
                  ? "结果文件暂时无法读取，请重试。"
                  : "Result files could not be loaded. Try again."}
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={outputs.retry}
              >
                {zh ? "重试结果文件" : "Retry result files"}
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={
              save.busy ||
              !file ||
              outputs.loading ||
              outputs.error ||
              Boolean(save.error && save.error !== "unavailable")
            }
            onClick={() => void save.save()}
          >
            {save.busy
              ? zh
                ? "正在保存…"
                : "Saving…"
              : zh
                ? "使用这个结果"
                : "Use this result"}
          </button>
          {save.error && (
            <p className="error-box" role="alert">
              {save.error === "changed"
                ? zh
                  ? "来源结果的状态或内容已变化，请重新选择原始结果。"
                  : "The source result's state or content changed. Select the original result again."
                : save.error === "incompatible"
                  ? zh
                    ? "这个结果不适合作为本模块的输入，请选择相容的结果文件。"
                    : "This result cannot be used by this module. Choose a compatible result file."
                  : save.error === "identity"
                    ? zh
                      ? "保存回复与所选结果不一致，请重新选择原始结果文件。"
                      : "The saved file does not match the selected result. Choose the original result file."
                    : zh
                      ? "未能确认结果是否保存，可重试同一个请求或选择其他结果。"
                      : "Result saving could not be confirmed. Retry the same request or choose another result."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
