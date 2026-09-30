import { useState, type FormEvent } from "react";
import {
  FolderOpenOutlined,
  PlusOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import { api } from "../api";
import type { Language, Project } from "../types";

interface Props {
  language: Language;
  projects: Project[];
  error: string;
  active: string | null;
  onChoose(id: string | null): void;
  onCreated(): void;
}
export function ProjectPanel({
  language,
  projects,
  error,
  active,
  onChoose,
  onCreated,
}: Props) {
  const zh = language === "zh";
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const project = await api.createProject(name, description);
      setName("");
      setDescription("");
      onCreated();
      onChoose(project.id);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="project-workspace">
      <header>
        <span className="eyebrow">PROJECT SPACE</span>
        <h1>{zh ? "项目空间" : "Projects"}</h1>
        <p>
          {zh
            ? "把同一研究问题的任务放在一起；任务和结果始终保留在本机。"
            : "Group tasks by research question. Data remains on this computer."}
        </p>
      </header>
      <div className="project-layout">
        <div className="studio-panel">
          <h3>
            <PlusOutlined /> {zh ? "新建项目" : "New project"}
          </h3>
          <form onSubmit={(e) => void create(e)}>
            <label>
              {zh ? "项目名称" : "Project name"}
              <input
                value={name}
                maxLength={80}
                required
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  zh ? "例如：靶点结构验证" : "e.g. Target structure validation"
                }
              />
            </label>
            <label>
              {zh ? "说明（可选）" : "Description (optional)"}
              <textarea
                value={description}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <button className="primary-button" disabled={saving}>
              {saving
                ? zh
                  ? "保存中…"
                  : "Saving…"
                : zh
                  ? "创建项目"
                  : "Create project"}
            </button>
          </form>
          {message && (
            <p role="alert" className="error-box">
              {message}
            </p>
          )}
        </div>
        <div className="studio-panel">
          <h3>
            <FolderOpenOutlined /> {zh ? "本机项目" : "Local projects"}
          </h3>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <button
            className={`project-row ${!active ? "active" : ""}`}
            onClick={() => onChoose(null)}
          >
            <ExperimentOutlined /> {zh ? "全部任务" : "All tasks"}
          </button>
          {projects.length ? (
            projects.map((project) => (
              <button
                className={`project-row ${active === project.id ? "active" : ""}`}
                onClick={() => onChoose(project.id)}
                key={project.id}
              >
                <FolderOpenOutlined />
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.description || (zh ? "无说明" : "No description")}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="muted small">
              {zh
                ? "尚未创建项目；可以先使用左侧表单。"
                : "No projects yet. You can still submit a task without one."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
