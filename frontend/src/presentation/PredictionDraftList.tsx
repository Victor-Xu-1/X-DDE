import { useEffect, useId, useRef, useState } from "react";
import { FileTextOutlined } from "@ant-design/icons";
import { api, request } from "../api";
import type { Language } from "../types";
import type { PredictionDraft } from "./prediction-draft-model";
import { mol1DraftAdapter } from "./mol1-draft-adapter";
import {
  draftToolQuery,
  type DraftAdapter,
  type DraftEditorState,
  type DraftRecord,
  type DraftSummary,
  type DraftTool,
} from "./prediction-draft-contract";
import "./prediction-drafts.css";

export function SharedPredictionDraftList<
  State extends DraftEditorState,
  Tool extends DraftTool,
>({
  adapter,
  language,
  busy,
  onResume,
  onClose,
}: {
  adapter: DraftAdapter<State, Tool>;
  language: Language;
  busy: boolean;
  onResume(value: DraftRecord<State, Tool>): void;
  onClose(): void;
}) {
  const zh = language === "zh",
    id = useId();
  const root = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const [rows, setRows] = useState<DraftSummary<Tool>[]>([]),
    [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<DraftSummary<Tool> | null>(null);
  const serial = useRef(0),
    alive = useRef(true),
    action = useRef(false);
  const resume = useRef(onResume);
  resume.current = onResume;
  useEffect(() => {
    alive.current = true;
    const dialog = root.current;
    dialog?.showModal();
    heading.current?.focus();
    return () => {
      alive.current = false;
      serial.current++;
      dialog?.close();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      token = ++serial.current;
    setLoading(true);
    setError("");
    setRows([]);
    setSelected(null);
    request<DraftSummary<Tool>[]>(
      `/prediction-drafts?archived=${archived}&offset=${page * 30}${draftToolQuery(adapter.tool).replace("?", "&")}`,
      { signal: controller.signal },
    )
      .then((values) => {
        if (serial.current === token) {
          if (values.some((row) => row.tool !== adapter.tool))
            throw new Error("Draft list belongs to another prediction model.");
          setRows(values);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && serial.current === token)
          setError(String(reason));
      })
      .finally(() => {
        if (serial.current === token) setLoading(false);
      });
    return () => controller.abort();
  }, [archived, page, refresh, adapter.tool]);
  async function perform(
    row: DraftSummary<Tool>,
    operation: "resume" | "archive",
  ) {
    if (action.current || busy) return;
    action.current = true;
    setPending(true);
    setError("");
    const token = serial.current;
    try {
      if (operation === "resume") {
        const loaded = adapter.readDraft(
          await request<DraftRecord<State, Tool>>(
            `/prediction-drafts/${row.id}${draftToolQuery(adapter.tool)}`,
          ),
        );
        if (alive.current && serial.current === token) {
          if (loaded.id !== row.id || loaded.revision !== row.revision)
            throw new Error(
              zh
                ? "草稿在读取期间有更新，请刷新列表后重试。"
                : "This draft changed while opening. Refresh the list and try again.",
            );
          if (loaded.archived)
            throw new Error(
              zh
                ? "草稿已归档，请先恢复。"
                : "This draft was archived. Restore it first.",
            );
          resume.current(loaded);
        }
      } else {
        await api.post(
          `/prediction-drafts/${row.id}/archive${draftToolQuery(adapter.tool)}`,
          {
            revision: row.revision,
            archived: !archived,
          },
        );
        if (alive.current && serial.current === token)
          setRefresh((value) => value + 1);
      }
    } catch (reason) {
      if (alive.current && serial.current === token) setError(String(reason));
    } finally {
      action.current = false;
      if (alive.current) setPending(false);
    }
  }
  const filtered = rows.filter((row) =>
    row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  function close() {
    // The native inert boundary must be released before focusing the opener.
    root.current?.close();
    onClose();
  }
  return (
    <dialog
      ref={root}
      className="prediction-drafts-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (event.target === event.currentTarget) close();
      }}
    >
      <header>
        <div>
          <small>
            {`${zh ? "结构预测" : "STRUCTURE PREDICTION"} · ${adapter.model}`}
          </small>
          <h2 ref={heading} tabIndex={-1} id={id}>
            {zh ? "草稿" : "Drafts"}
          </h2>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={zh ? "关闭草稿" : "Close drafts"}
        >
          ×
        </button>
      </header>
      <div className="prediction-drafts-body">
        <p>
          {zh
            ? "从上次的输入继续编辑。"
            : "Pick up a prediction where you left off."}
        </p>
        <div className="prediction-drafts-toolbar">
          <label className="field">
            {zh ? "搜索任务名称" : "Search task name"}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            aria-pressed={archived}
            onClick={() => {
              setArchived(!archived);
              setPage(0);
              setQuery("");
            }}
          >
            {archived
              ? zh
                ? "查看草稿"
                : "Saved drafts"
              : zh
                ? "已归档"
                : "Archived"}
          </button>
        </div>
        {loading ? (
          <p role="status">{zh ? "正在读取草稿…" : "Loading drafts…"}</p>
        ) : filtered.length ? (
          <ul
            className="prediction-draft-rows"
            aria-label={zh ? "已保存草稿" : "Saved drafts"}
          >
            {filtered.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>
                    {row.name || (zh ? "未命名预测" : "Untitled prediction")}
                  </strong>
                  <small>
                    {row.entities} {zh ? "组分" : "entities"} ·{" "}
                    {new Date(row.updated_at).toLocaleString(
                      zh ? "zh-CN" : "en-GB",
                    )}
                  </small>
                </div>
                <div className="prediction-draft-row-actions">
                  {!archived && (
                    <button
                      type="button"
                      disabled={pending || busy}
                      onClick={() => setSelected(row)}
                    >
                      {zh ? "继续编辑" : "Resume"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending || busy}
                    onClick={() => void perform(row, "archive")}
                  >
                    {archived
                      ? zh
                        ? "恢复"
                        : "Restore"
                      : zh
                        ? "归档"
                        : "Archive"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="prediction-drafts-empty">
            <FileTextOutlined aria-hidden="true" />
            <h3>
              {query
                ? zh
                  ? "没有匹配的草稿"
                  : "No matching drafts"
                : archived
                  ? zh
                    ? "没有已归档草稿"
                    : "No archived drafts"
                  : zh
                    ? "还没有草稿"
                    : "No drafts yet"}
            </h3>
            <p>
              {zh
                ? "保存当前预测的输入与设置，稍后继续编辑。"
                : "Save a prediction's inputs and settings, then return when you are ready."}
            </p>
          </div>
        )}
        {selected && (
          <section
            className="prediction-draft-confirm"
            aria-label={zh ? "确认恢复草稿" : "Confirm draft resume"}
          >
            <h3>{zh ? "替换当前输入？" : "Replace the current inputs?"}</h3>
            <p>
              {zh
                ? "尚未保存的修改不会保留。需要保留时，请先返回并保存当前草稿。"
                : "Unsaved edits will be replaced. To keep them, close this list and save your current draft first."}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSelected(null)}
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              disabled={pending || busy}
              onClick={() => void perform(selected, "resume")}
            >
              {pending
                ? zh
                  ? "正在读取…"
                  : "Opening…"
                : zh
                  ? "恢复此草稿"
                  : "Resume this draft"}
            </button>
          </section>
        )}
        {error && (
          <div role="alert" className="error-box">
            <p>{error}</p>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRefresh((value) => value + 1)}
            >
              {zh ? "刷新列表" : "Refresh list"}
            </button>
          </div>
        )}
      </div>
      <footer>
        <small>
          {zh
            ? "保存在这台设备 · 尚未提交"
            : "Saved on this device · Not submitted"}
        </small>
        <div>
          {page > 0 && (
            <button
              type="button"
              disabled={pending || loading}
              onClick={() => setPage(page - 1)}
            >
              {zh ? "上一页" : "Previous"}
            </button>
          )}
          {archived && rows.length === 30 && (
            <button
              type="button"
              disabled={pending || loading}
              onClick={() => setPage(page + 1)}
            >
              {zh ? "下一页" : "Next"}
            </button>
          )}
          {!archived && <small>{rows.length} / 30</small>}
        </div>
      </footer>
    </dialog>
  );
}

/** Legacy Mol-1 entry stays source-compatible with native consumers. */
export function PredictionDraftList(props: {
  language: Language;
  busy: boolean;
  onResume(value: PredictionDraft): void;
  onClose(): void;
}) {
  return <SharedPredictionDraftList {...props} adapter={mol1DraftAdapter} />;
}
