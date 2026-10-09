import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import type { Language, Project } from "../types";
export function ProjectCreateDialog({
  language,
  onClose,
  onCreated,
}: {
  language: Language;
  onClose(): void;
  onCreated(project: Project): void;
}) {
  const zh = language === "zh",
    id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    nameInput.current?.focus();
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      onCreated(await api.createProject(name.trim(), description.trim()));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="project-create-dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        if (saving) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id={id}>{zh ? "新建项目" : "New project"}</h2>
        <button
          type="button"
          className="text-button"
          aria-label={zh ? "关闭" : "Close"}
          disabled={saving}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form onSubmit={(e) => void create(e)}>
        <label className="field">
          {zh ? "项目名称" : "Project name"}
          <input
            ref={nameInput}
            autoFocus
            value={name}
            maxLength={80}
            required
            onChange={(e) => setName(e.target.value)}
            placeholder={
              zh ? "例如：靶点先导研究" : "e.g. Target lead discovery"
            }
          />
        </label>
        <label className="field">
          {zh ? "说明（可选）" : "Description (optional)"}
          <textarea
            value={description}
            maxLength={500}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <footer>
          <button
            className="secondary-button"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            {zh ? "取消" : "Cancel"}
          </button>
          <button className="primary-button" disabled={saving || !name.trim()}>
            {saving
              ? zh
                ? "保存中…"
                : "Saving…"
              : zh
                ? "创建项目"
                : "Create project"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
