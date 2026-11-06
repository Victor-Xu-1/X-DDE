import type { Language } from "../types";
import type { useSequenceSave } from "./useSequenceSave";

export function SequenceTextInput({
  language,
  text,
  busy,
  confirmed,
  error,
  onText,
  onConfirm,
}: {
  language: Language;
  text: string;
  busy: boolean;
  confirmed: boolean;
  error: ReturnType<typeof useSequenceSave>["error"];
  onText(value: string): void;
  onConfirm(): void;
}) {
  const zh = language === "zh";
  return (
    <>
      <label className="field">
        {zh ? "序列或 FASTA" : "Sequence or FASTA"}
        <textarea
          className="sequence-material-text"
          rows={6}
          value={text}
          maxLength={2 * 1024 ** 2}
          disabled={busy}
          spellCheck={false}
          onChange={(event) => onText(event.target.value)}
          placeholder={
            zh
              ? "粘贴一条序列；多条序列使用不同的 FASTA 标题。"
              : "Paste one sequence; use distinct FASTA headers for multiple sequences."
          }
        />
      </label>
      <button
        type="button"
        disabled={busy || !text.trim() || confirmed}
        onClick={onConfirm}
      >
        {busy
          ? zh
            ? "正在保存…"
            : "Saving…"
          : zh
            ? "确认序列"
            : "Confirm sequences"}
      </button>
      {confirmed && (
        <p role="status">
          {zh
            ? "序列已保存，可进入下一步。"
            : "Sequence saved; continue to the next step."}
        </p>
      )}
      {error && (
        <p role="alert">
          {error === "size"
            ? zh
              ? "序列输入不能超过 2 MiB。"
              : "Sequence input must not exceed 2 MiB."
            : error === "identity"
              ? zh
                ? "保存回复与当前序列不一致，请重新确认。"
                : "The save response does not match the current sequence. Confirm it again."
              : zh
                ? "未能确认序列是否保存，重试会保留同一个保存请求。"
                : "Sequence saving could not be confirmed. Retry keeps the same save request."}
        </p>
      )}
    </>
  );
}
