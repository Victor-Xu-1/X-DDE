import { FolderOpenOutlined, ArrowRightOutlined } from "@ant-design/icons";
import type { Language, Project } from "../types";

export function ProjectContinuation({
  language,
  projects,
  onOpen,
}: {
  language: Language;
  projects: Project[];
  onOpen(project: Project | null): void;
}) {
  const zh = language === "zh",
    project = projects[0] ?? null;
  return (
    <section
      className="project-continuation"
      aria-label={zh ? "继续研究" : "Continue research"}
    >
      <FolderOpenOutlined aria-hidden="true" />
      <div>
        <small>{zh ? "研究空间" : "Research workspace"}</small>
        <strong>
          {project?.name ??
            (zh ? "项目与研究文件" : "Projects and research files")}
        </strong>
      </div>
      <button type="button" onClick={() => onOpen(project)}>
        {zh ? "进入研究空间" : "Open research workspace"}{" "}
        <ArrowRightOutlined aria-hidden="true" />
      </button>
    </section>
  );
}
