import { useState } from "react";
import {
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
  const [creating, setCreating] = useState(false),
    [query, setQuery] = useState("");
  const visible = projects.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="project-workspace">
      <header className="project-toolbar">
        <h1 className="sr-only">{zh ? "研究项目" : "Projects"}</h1>
        <input
          type="search"
          aria-label={zh ? "查找项目" : "Search projects"}
          placeholder={zh ? "查找项目…" : "Search projects…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary-button" onClick={() => setCreating(true)}>
          <PlusOutlined /> {zh ? "新建项目" : "New project"}
        </button>
      </header>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="project-list">
        <button
          className={`project-row ${!active ? "active" : ""}`}
          onClick={() => onChoose(null)}
        >
          <ExperimentOutlined /> {zh ? "全部任务" : "All tasks"}
        </button>
        {visible.map((project) => (
          <button
            className={`project-row ${active === project.id ? "active" : ""}`}
            onClick={() => onChoose(project.id)}
            key={project.id}
          >
            <FolderOpenOutlined />
            <span>
              <strong>{project.name}</strong>
              {project.description && <small>{project.description}</small>}
            </span>
          </button>
        ))}
        {!visible.length && (
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
            {!projects.length && (
              <button
                className="secondary-button"
                onClick={() => setCreating(true)}
              >
                {zh ? "创建第一个项目" : "Create your first project"}
              </button>
            )}
          </div>
        )}
      </div>
      {creating && (
        <ProjectCreateDialog
          language={language}
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            onCreated();
            onChoose(project.id);
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}
