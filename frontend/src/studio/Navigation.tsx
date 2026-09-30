import {
  HomeFilled,
  FolderOutlined,
  ProfileOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  BellOutlined,
  UserOutlined,
  SettingOutlined,
  MoreOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import type { ToolId } from "../operations/catalog";
import type { Job, Language } from "../types";

export type View =
  | "pockets"
  | "molecule-design"
  | "antibody-design"
  | "properties"
  | "regions"
  | "research"
  | "home"
  | "tools"
  | "projects"
  | "tasks"
  | "analysis"
  | "reports"
  | "models"
  | "deployment"
  | "editors"
  | "help"
  | "settings"
  | "overview";
export const coreTools: Readonly<Partial<Record<View, ToolId>>> = Object.freeze(
  {
    pockets: "p2rank.detect",
    "molecule-design": "diffsbdd.generate",
    "antibody-design": "campaign",
    properties: "properties",
    regions: "regions",
  },
);
export const coreToolForView = (view: View) => coreTools[view];
const items = [
  { id: "home", cn: "结构预测", en: "Structure prediction", icon: HomeFilled },
  {
    id: "pockets",
    cn: "口袋寻找",
    en: "Pocket discovery",
    icon: SearchOutlined,
  },
  {
    id: "molecule-design",
    cn: "分子生成",
    en: "Molecule generation",
    icon: ExperimentOutlined,
  },
  {
    id: "antibody-design",
    cn: "抗体设计",
    en: "Antibody design",
    icon: DeploymentUnitOutlined,
  },
  {
    id: "properties",
    cn: "性质计算",
    en: "Molecular properties",
    icon: BarChartOutlined,
  },
  {
    id: "editors",
    cn: "分子编辑",
    en: "Molecule editing",
    icon: ExperimentOutlined,
  },
  {
    id: "tools",
    cn: "全部能力",
    en: "All capabilities",
    icon: ExperimentOutlined,
  },
  {
    id: "research",
    cn: "研究资产",
    en: "Research assets",
    icon: DeploymentUnitOutlined,
  },
  { id: "projects", cn: "研究项目", en: "Projects", icon: FolderOutlined },
  { id: "tasks", cn: "任务记录", en: "Task history", icon: ProfileOutlined },
] as const;
const management = [
  {
    label: ["个人", "Personal"],
    items: [
      {
        id: "settings",
        cn: "账户与设置",
        en: "Account & settings",
        icon: SettingOutlined,
      },
    ],
  },
  {
    label: ["工作台", "Workspace"],
    items: [
      {
        id: "regions",
        cn: "分子区域",
        en: "Molecular regions",
        icon: ExperimentOutlined,
      },
      { id: "analysis", cn: "结果解读", en: "Results", icon: BarChartOutlined },
      { id: "reports", cn: "导出结果", en: "Exports", icon: FileTextOutlined },
      {
        id: "overview",
        cn: "工作空间概况",
        en: "Workspace overview",
        icon: BarChartOutlined,
      },
      {
        id: "deployment",
        cn: "安装与组件",
        en: "Installation & components",
        icon: DeploymentUnitOutlined,
      },
      {
        id: "models",
        cn: "运行状态",
        en: "Runtime status",
        icon: DatabaseOutlined,
      },
    ],
  },
  {
    label: ["支持", "Support"],
    items: [
      { id: "help", cn: "帮助中心", en: "Help", icon: QuestionCircleOutlined },
    ],
  },
] as const;
export function Navigation({
  view,
  onView,
  language,
  jobs,
}: {
  view: View;
  onView(value: View): void;
  language: Language;
  jobs: Job[];
}) {
  const zh = language === "zh";
  const running = jobs.filter((job) => job.status === "running").length;
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const isManagement = management.some((group) =>
    group.items.some((item) => item.id === view),
  );
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <aside className="studio-sidebar">
      <button
        className="studio-brand"
        aria-label="X-DDE"
        onClick={() => onView("tools")}
      >
        <img
          className="studio-brand-mark"
          src="/brand/x-dde-mark.png"
          alt=""
          width="64"
          height="64"
        />
        <img
          className="studio-brand-wordmark"
          src="/brand/x-dde-wordmark.png"
          alt={zh ? "X-DDE 药物研究工作台" : "X-DDE discovery workbench"}
          width="755"
          height="165"
        />
      </button>
      <nav aria-label={zh ? "主导航" : "Main navigation"}>
        {items.map((item) => (
          <button
            key={item.id}
            title={zh ? item.cn : item.en}
            aria-label={zh ? item.cn : item.en}
            aria-current={view === item.id ? "page" : undefined}
            className={view === item.id ? "active" : ""}
            onClick={() => onView(item.id)}
          >
            <item.icon />
            <span>{zh ? item.cn : item.en}</span>
            <small className="nav-short" aria-hidden="true">
              {
                {
                  research: ["资产", "Assets"],
                  tools: ["能力", "Tools"],
                  home: ["预测", "Predict"],
                  pockets: ["口袋", "Pockets"],
                  "molecule-design": ["生成", "Generate"],
                  "antibody-design": ["抗体", "Antibody"],
                  properties: ["性质", "Properties"],
                  editors: ["编辑", "Editors"],
                  projects: ["项目", "Projects"],
                  tasks: ["任务", "Tasks"],
                  analysis: ["结果", "Results"],
                  reports: ["导出", "Export"],
                }[item.id][zh ? 0 : 1]
              }
            </small>
            {item.id === "tasks" && running > 0 && <b>{running}</b>}
          </button>
        ))}
      </nav>
      <div
        className="sidebar-management"
        ref={container}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setOpen(false);
        }}
      >
        {open && (
          <div
            className="management-menu"
            id="management-menu"
            ref={menu}
            role="menu"
            aria-label={zh ? "工作台管理" : "Workbench management"}
            onKeyDown={(event) => {
              const buttons = Array.from(
                menu.current?.querySelectorAll<HTMLButtonElement>("button") ??
                  [],
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              let next: number | undefined;
              if (event.key === "ArrowDown")
                next = (index + 1) % buttons.length;
              if (event.key === "ArrowUp")
                next = (index - 1 + buttons.length) % buttons.length;
              if (event.key === "Home") next = 0;
              if (event.key === "End") next = buttons.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                buttons[next]?.focus();
              }
            }}
          >
            <div className="management-menu-heading">
              <strong>{zh ? "工作台管理" : "Workbench management"}</strong>
              <small>{zh ? "本地 · 单用户" : "Local · single user"}</small>
            </div>
            {management.map((group) => (
              <div
                className="management-group"
                key={group.label[1]}
                role="group"
                aria-label={group.label[zh ? 0 : 1]}
              >
                <span className="management-group-label">
                  {group.label[zh ? 0 : 1]}
                </span>
                {group.items.map((item) => (
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={zh ? item.cn : item.en}
                    key={item.id}
                    aria-current={view === item.id ? "page" : undefined}
                    onClick={() => {
                      setOpen(false);
                      onView(item.id);
                      trigger.current?.focus();
                    }}
                  >
                    <item.icon />
                    <span>{zh ? item.cn : item.en}</span>
                    <RightOutlined />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          ref={trigger}
          className={"management-trigger" + (isManagement ? " active" : "")}
          aria-label={zh ? "账户与设置" : "Account & settings"}
          title={zh ? "账户与设置" : "Account & settings"}
          aria-haspopup="menu"
          aria-controls={open ? "management-menu" : undefined}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="management-avatar">
            <UserOutlined />
          </span>
          <span className="management-trigger-copy">
            <strong>{zh ? "本地用户" : "Local user"}</strong>
            <small>{zh ? "账户与设置" : "Account & settings"}</small>
          </span>
          <MoreOutlined className="management-more" />
        </button>
      </div>
    </aside>
  );
}
export function viewTitle(view: View, language: Language) {
  const all: { id: View; cn: string; en: string }[] = [...items];
  for (const group of management) all.push(...group.items);
  const item = all.find((item) => item.id === view);
  return item ? (language === "zh" ? item.cn : item.en) : "X-DDE";
}
export function Header({
  view,
  language,
  jobs,
  onJob,
  storageWarning,
}: {
  view: View;
  language: Language;
  jobs: Job[];
  onJob(id: string): void;
  storageWarning: boolean;
}) {
  const zh = language === "zh";
  const [query, setQuery] = useState("");
  const header = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const notifications = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (!header.current?.contains(event.target as Node)) {
        setQuery("");
        if (notifications.current) notifications.current.open = false;
      }
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const matches = query.trim()
    ? jobs
        .filter((job) =>
          `${job.request.name} ${job.id}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
        .slice(0, 8)
    : [];
  const problems = jobs
    .filter((job) => ["failed", "interrupted"].includes(job.status))
    .slice(0, 5);
  return (
    <header
      className="studio-topbar"
      ref={header}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (query) {
          setQuery("");
          search.current?.focus();
        }
        if (notifications.current?.open) {
          notifications.current.open = false;
          notifications.current.querySelector("summary")?.focus();
        }
      }}
    >
      <span className="page-context">{viewTitle(view, language)}</span>
      <div className="global-search">
        <SearchOutlined />
        <label className="sr-only" htmlFor="global-search">
          {zh ? "搜索任务" : "Search tasks"}
        </label>
        <input
          id="global-search"
          ref={search}
          type="search"
          value={query}
          aria-expanded={Boolean(query.trim())}
          aria-controls={query.trim() ? "task-search-results" : undefined}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={zh ? "搜索任务名称或 ID" : "Search tasks by name or ID"}
        />
        {query.trim() && (
          <div
            className="search-results"
            id="task-search-results"
            role="region"
            aria-label={zh ? "任务搜索结果" : "Task search results"}
          >
            {matches.length ? (
              matches.map((job) => (
                <button
                  key={job.id}
                  onClick={() => {
                    onJob(job.id);
                    setQuery("");
                  }}
                >
                  {job.request.name}
                  <small>{job.id.slice(0, 8)}</small>
                </button>
              ))
            ) : (
              <p>{zh ? "没有匹配的任务" : "No matching task"}</p>
            )}
          </div>
        )}
      </div>
      <div className="top-actions">
        <details className="top-popover" ref={notifications}>
          <summary aria-label={zh ? "任务提醒" : "Task notifications"}>
            <BellOutlined />
            {problems.length > 0 && <span className="notification-dot" />}
          </summary>
          <div>
            <strong>{zh ? "需关注的任务" : "Tasks needing attention"}</strong>
            {problems.length ? (
              problems.map((job) => (
                <button
                  key={job.id}
                  onClick={() => {
                    onJob(job.id);
                    if (notifications.current)
                      notifications.current.open = false;
                  }}
                >
                  {job.request.name} · {job.status}
                </button>
              ))
            ) : (
              <p>{zh ? "目前没有失败任务" : "No failed tasks"}</p>
            )}
          </div>
        </details>
      </div>
      {storageWarning && (
        <div role="status" className="header-warning">
          {zh
            ? "浏览器无法记住语言选择。"
            : "Language preference could not be saved."}
        </div>
      )}
    </header>
  );
}
