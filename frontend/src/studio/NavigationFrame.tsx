import { useEffect, useRef, useState, type ReactNode } from "react";
import { CloseOutlined, MenuOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { View } from "./navigation-model";
import "./navigation-frame.css";

function useCompactNavigation() {
  const [compact, setCompact] = useState(
    () => window.matchMedia?.("(max-width: 960px)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 960px)");
    if (!query) return;
    const changed = () => setCompact(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  return compact;
}

export function NavigationFrame({
  language,
  onView,
  children,
}: {
  language: Language;
  onView(view: View): void;
  children(navigate: (view: View) => void): ReactNode;
}) {
  const compact = useCompactNavigation(),
    zh = language === "zh";
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!compact) {
      setOpen(false);
      return;
    }
    if (open && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [compact, open]);
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  if (!compact) return children(onView);
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="mobile-navigation-trigger"
        aria-label={zh ? "打开研究导航" : "Open research navigation"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "research-navigation-dialog" : undefined}
        onClick={() => setOpen(true)}
      >
        <MenuOutlined />
      </button>
      <dialog
        id="research-navigation-dialog"
        className="mobile-navigation-dialog"
        ref={dialog}
        aria-label={zh ? "研究导航" : "Research navigation"}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="mobile-navigation-heading">
          <span>{zh ? "研究导航" : "Research navigation"}</span>
          <button
            type="button"
            autoFocus
            aria-label={zh ? "关闭研究导航" : "Close research navigation"}
            onClick={close}
          >
            <CloseOutlined />
          </button>
        </div>
        {children((view) => {
          close();
          onView(view);
        })}
      </dialog>
    </>
  );
}
