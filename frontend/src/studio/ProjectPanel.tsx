import { useState } from "react";
import {
  ArrowRightOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import type { Language, Project } from "../types";
import { ProjectCreateDialog } from "./ProjectCreateDialog";
import "./projects.css";

interface Props {
  language: Language;
  projects: Project[];
  error: string;
  loading: boolean;
  onRetry(): void;
  active: string | null;
  onChoose(id: string | null): void;
  onCreated(project: Project): void;
}
export function ProjectPanel({
  language,
  projects,
  error,
  loading,
  onRetry,
  active,
  onChoose,
  onCreated,
}: Props) {
  const zh = language === "zh";
  const [creating, setCreating] = useState(false),
    [query, setQuery] = useState(""),
    [createdName, setCreatedName] = useState("");
  const visible = projects.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="project-workspace">
      <header className="project-toolbar">
        <h1 className="sr-only">{zh ? "研究项目" : "Projects"}</h1>
        <button
          type="button"
          className="text-button project-task-shortcut"
          onClick={() => onChoose(null)}
        >
          <ExperimentOutlined aria-hidden="true" />
          {zh ? "全部结构预测任务" : "All structure prediction tasks"}
          <ArrowRightOutlined aria-hidden="true" />
        </button>
        {projects.length > 0 && (
          <input
            type="search"
            aria-label={zh ? "查找项目" : "Search projects"}
            placeholder={zh ? "查找项目…" : "Search projects…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <button className="primary-button" onClick={() => setCreating(true)}>
          <PlusOutlined aria-hidden="true" /> {zh ? "新建项目" : "New project"}
        </button>
      </header>
      {createdName && (
        <p role="status" className="notice">
          {zh
            ? `项目“${createdName}”已创建。`
            : `Project “${createdName}” was created.`}
        </p>
      )}
      {error && (
        <div role="alert" className="error-box">
          <p>
            {zh ? "项目列表读取失败。" : "Unable to load the project list."}{" "}
            {error}
          </p>
          <button
            className="secondary-button"
            disabled={loading}
            onClick={onRetry}
          >
            {loading ? (zh ? "重试中…" : "Retrying…") : zh ? "重试" : "Retry"}
          </button>
        </div>
      )}
      {loading && !error && (
        <p role="status">{zh ? "正在读取项目…" : "Loading projects…"}</p>
      )}
      <div className="project-list">
        {visible.map((project) => (
          <button
            className={`project-row ${active === project.id ? "active" : ""}`}
            aria-current={active === project.id ? true : undefined}
            onClick={() => onChoose(project.id)}
            key={project.id}
          >
            <FolderOpenOutlined aria-hidden="true" />
            <span className="project-row-copy">
              <strong>{project.name}</strong>
              {project.description && <small>{project.description}</small>}
            </span>
            <ArrowRightOutlined className="project-row-arrow" aria-hidden="true" />
          </button>
        ))}
        {!visible.length && (projects.length > 0 || (!error && !loading)) && (
          <div className="project-empty">
            <p>
              {projects.length
                ? zh
                  ? "没有匹配的项目。"
                  : "No matching projects."
                : zh
                  ? "还没有研究项目"
                  : "No research projects yet"}
            </p>
          </div>
        )}
      </div>
      {creating && (
        <ProjectCreateDialog
          language={language}
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreatedName(project.name);
            onCreated(project);
            onChoose(project.id);
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}
