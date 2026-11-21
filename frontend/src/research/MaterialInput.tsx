import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Language } from "../types";
import type { AssetKind } from "../operations/types";
import { ChoiceCards } from "../guided/ChoiceCards";
import "./material-input.css";

const desktopQuery = "(width > 1000px)";
function subscribeToDesktop(change: () => void) {
  const media = window.matchMedia?.(desktopQuery);
  media?.addEventListener("change", change);
  return () => media?.removeEventListener("change", change);
}
const isDesktop = () => window.matchMedia?.(desktopQuery).matches ?? false;
const neverDesktop = () => false;
const subscribeToNothing = () => () => undefined;

/** Shared presentation only; each picker owns its source and verified selection. */
export function MaterialInput<T extends string>({
  label,
  kind,
  source,
  onSource,
  options,
  selection,
  compactLanguage,
  children,
}: {
  label: string;
  kind: AssetKind;
  source: T;
  onSource(value: T): void;
  options: readonly { value: T; title: string }[];
  selection?: {
    key: string;
    name: string;
    detail?: string;
  };
  compactLanguage?: Language;
  children: ReactNode;
}) {
  const desktop = useSyncExternalStore(
    compactLanguage ? subscribeToDesktop : subscribeToNothing,
    compactLanguage ? isDesktop : neverDesktop,
    neverDesktop,
  );
  const selected = desktop ? selection : undefined;
  const key = selected?.key;
  const zh = compactLanguage === "zh";
  const [editingKey, setEditingKey] = useState<string>();
  const [collapsed, setCollapsed] = useState(false);
  const hideEditor = Boolean(key && key !== editingKey);
  const picker = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const focusedHere = useRef(false);
  const headingId = useId();
  const bodyId = useId();
  useLayoutEffect(() => {
    if (!desktop) return;
    function leave(event: Event) {
      if (
        event.target instanceof Node &&
        !picker.current?.contains(event.target)
      )
        focusedHere.current = false;
    }
    document.addEventListener("focusin", leave, true);
    document.addEventListener("pointerdown", leave, true);
    return () => {
      document.removeEventListener("focusin", leave, true);
      document.removeEventListener("pointerdown", leave, true);
      focusedHere.current = false;
    };
  }, [desktop]);
  useLayoutEffect(() => {
    const active = document.activeElement;
    // A pending verification can disable or replace the focused control.
    if (
      hideEditor &&
      (picker.current?.contains(active) ||
        (active === document.body && focusedHere.current))
    ) {
      toggle.current?.focus();
    }
    if (key && key !== editingKey) setEditingKey(undefined);
    // Recover keyboard focus before removing the source controls from the layout.
    setCollapsed(hideEditor);
  }, [hideEditor, key, editingKey]);
  const hidden = hideEditor && collapsed;
  const action = hidden ? (zh ? "更换" : "Change") : zh ? "完成" : "Done";

  return (
    <div
      ref={picker}
      onFocusCapture={
        desktop
          ? () => {
              focusedHere.current = true;
            }
          : undefined
      }
      className="reference-material"
      data-material-kind={kind}
      data-source-count={options.length}
      data-material-selection={
        selected ? (hidden ? "summary" : "editing") : undefined
      }
    >
      {selected && (
        <div className="reference-material-summary">
          <div className="reference-material-identity">
            <span>{label}</span>
            <div>
              <strong title={selected.name}>{selected.name}</strong>
              {selected.detail && <span>{selected.detail}</span>}
            </div>
          </div>
          <button
            ref={toggle}
            type="button"
            className="secondary-button"
            data-material-disclosure
            aria-controls={headingId + " " + bodyId}
            aria-expanded={!hidden}
            aria-label={zh ? `${action}${label}` : `${action} ${label}`}
            onClick={() => setEditingKey(hidden ? key : undefined)}
          >
            {action}
          </button>
        </div>
      )}
      <header
        id={headingId}
        className="reference-material-heading"
        hidden={hidden}
      >
        <h3 className={"input-purpose" + (selected ? " sr-only" : "")}>
          {label}
        </h3>
        <ChoiceCards
          label={label}
          value={source}
          onChange={onSource}
          options={options}
        />
      </header>
      <div id={bodyId} className="reference-material-body" hidden={hidden}>
        {children}
      </div>
    </div>
  );
}
