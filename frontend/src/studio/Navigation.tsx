import { useEffect, useRef, useState } from "react";
import {
  FolderOutlined,
  ProfileOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import type { Job, Language } from "../types";
import { researchIcons } from "./research-icons";
import {
  navigationItems,
  managementItems,
  navigationActive,
  type View,
} from "./navigation-model";
export { viewTitle } from "./navigation-model";
export type { View } from "./navigation-model";
const otherIcons = {
  research: FolderOutlined,
  tasks: ProfileOutlined,
  tools: ExperimentOutlined,
};
const managementIcons = {
  deployment: DeploymentUnitOutlined,
  settings: SettingOutlined,
  help: QuestionCircleOutlined,
};
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
  const zh = language === "zh",
    index = zh ? 0 : 1,
    running = jobs.filter((job) => job.status === "running").length;
  const [open, setOpen] = useState(false),
    container = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const isManagement = managementItems.some((item) => item.id === view);
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
        {navigationItems.map((item) => {
          const active = navigationActive(view, item),
            Icon = item.module
              ? researchIcons[item.module]
              : otherIcons[item.id as keyof typeof otherIcons];
          return (
            <button
              key={item.id}
              title={item.help[index]}
              aria-label={item.label[index]}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : ""}
              onClick={() => onView(item.id)}
            >
              <Icon />
              <span>{item.label[index]}</span>
              <small className="nav-short" aria-hidden="true">
                {item.short[index]}
              </small>
              {item.id === "tasks" && running > 0 && <b>{running}</b>}
            </button>
          );
        })}
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
            aria-label={zh ? "工作台设置" : "Workbench settings"}
            onKeyDown={(event) => {
              const buttons = Array.from(
                  menu.current?.querySelectorAll<HTMLButtonElement>("button") ??
                    [],
                ),
                index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
              const next =
                event.key === "ArrowDown"
                  ? (index + 1) % buttons.length
                  : event.key === "ArrowUp"
                    ? (index - 1 + buttons.length) % buttons.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? buttons.length - 1
                        : undefined;
              if (next !== undefined) {
                event.preventDefault();
                buttons[next]?.focus();
              }
            }}
          >
            {managementItems.map((item) => {
              const Icon = managementIcons[item.id];
              return (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={item.label[index]}
                  key={item.id}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onView(item.id);
                    trigger.current?.focus();
                  }}
                >
                  <Icon />
                  <span>{item.label[index]}</span>
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          ref={trigger}
          className={"management-trigger" + (isManagement ? " active" : "")}
          aria-label={zh ? "设置与帮助" : "Settings and help"}
          title={zh ? "设置与帮助" : "Settings and help"}
          aria-haspopup="menu"
          aria-controls={open ? "management-menu" : undefined}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <SettingOutlined />
          <span className="management-trigger-copy">
            {zh ? "设置与帮助" : "Settings and help"}
          </span>
          <MoreOutlined className="management-more" />
        </button>
      </div>
    </aside>
  );
}
