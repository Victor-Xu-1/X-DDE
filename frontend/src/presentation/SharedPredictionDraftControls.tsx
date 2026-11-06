import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { Language } from "../types";
import { draftFingerprint } from "./prediction-draft-model";
import {
  draftToolQuery,
  type DraftAdapter,
  type DraftEditorState,
  type DraftRecord,
  type DraftTool,
} from "./prediction-draft-contract";
import { SharedPredictionDraftList } from "./PredictionDraftList";
import "./prediction-drafts.css";

export function SharedPredictionDraftControls<
  State extends DraftEditorState,
  Tool extends DraftTool,
>({
  adapter,
  state,
  initial,
  language,
  busy,
  onName,
  onResume,
}: {
  adapter: DraftAdapter<State, Tool>;
  state: State;
  initial: DraftRecord<State, Tool> | null;
  language: Language;
  busy: boolean;
  onName(value: string): void;
  onResume(value: DraftRecord<State, Tool>): void;
}) {
  const zh = language === "zh";
  const [saved, setSaved] = useState(initial),
    [saving, setSaving] = useState(false),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const current = useRef(state);
  current.current = state;
  const mounted = useRef(true),
    pending = useRef(false),
    trigger = useRef<HTMLButtonElement>(null);
  const intent = useRef<{ id: string; revision: number } | null>(initial);
  const openedState = useRef("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save(copy = false) {
    if (pending.current || busy) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const snapshot = adapter.readState(structuredClone(current.current));
      if (copy || !intent.current)
        intent.current = { id: crypto.randomUUID(), revision: 0 };
      const target = intent.current;
      const value = adapter.readDraft(
        await api.authorized<DraftRecord<State, Tool>>(
          `/prediction-drafts/${target.id}${draftToolQuery(adapter.tool)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tool: adapter.tool,
              schema_version: 1,
              revision: target.revision,
              state: snapshot,
            }),
          },
        ),
      );
      if (!mounted.current) return;
      if (
        value.id !== target.id ||
        value.archived ||
        draftFingerprint(value.state) !== draftFingerprint(snapshot)
      )
        throw new Error(
          "The saved response does not match this draft. Your current inputs were retained.",
        );
      intent.current = { id: value.id, revision: value.revision };
      setSaved(value);
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof ApiError && reason.status === 409
            ? zh
              ? "此草稿在其他页面有更新。请重新打开，或保存为新草稿。"
              : "This draft changed in another page. Reopen it or save a new copy."
            : reason instanceof ApiError && reason.status === 429
              ? zh
                ? "已达到 30 个草稿，请先归档不再编辑的草稿。"
                : "You have 30 drafts. Archive one before saving another."
              : (zh
                  ? "未能保存草稿，当前输入已保留。"
                  : "Could not save the draft. Your current inputs were retained.") +
                " " +
                String(reason),
        );
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const unchanged =
    saved && draftFingerprint(saved.state) === draftFingerprint(state);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <section
      className="prediction-draft-controls"
      aria-label={zh ? "预测草稿" : "Prediction draft"}
    >
      <label className="field">
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          value={state.name}
          maxLength={80}
          disabled={busy}
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      <div className="prediction-draft-actions">
        <button
          type="button"
          disabled={saving || busy}
          onClick={() => void save()}
        >
          {saving
            ? zh
              ? "正在保存…"
              : "Saving…"
            : zh
              ? "保存草稿"
              : "Save draft"}
        </button>
        <button
          type="button"
          ref={trigger}
          disabled={saving || busy}
          onClick={() => {
            openedState.current = draftFingerprint(current.current);
            setOpen(true);
          }}
        >
          {zh ? "打开草稿" : "Open drafts"}
        </button>
        {intent.current && (
          <button
            type="button"
            disabled={saving || busy}
            onClick={() => void save(true)}
          >
            {zh ? "保存为新草稿" : "Save a new copy"}
          </button>
        )}
      </div>
      {saved && (
        <small role="status">
          {unchanged
            ? zh
              ? "已保存 · 尚未提交"
              : "Saved · Not submitted"
            : zh
              ? "当前修改尚未保存"
              : "Current edits are not saved"}
        </small>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {open && (
        <SharedPredictionDraftList
          adapter={adapter}
          language={language}
          busy={saving || busy}
          onClose={close}
          onResume={(value) => {
            if (draftFingerprint(current.current) !== openedState.current)
              throw new Error(
                zh
                  ? "读取期间输入已变化，请重新打开草稿。"
                  : "Inputs changed while opening the draft. Open it again to continue.",
              );
            onResume(value);
          }}
        />
      )}
    </section>
  );
}
