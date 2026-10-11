import type { Language } from "../types";

export function EnvironmentRecheck({
  ready,
  onRecheck,
  language,
  busy = false,
}: {
  ready: boolean | undefined;
  onRecheck?(): void;
  language: Language;
  busy?: boolean;
}) {
  if (ready === true || !onRecheck) return null;
  return (
    <button
      type="button"
      className="secondary-button"
      disabled={busy || ready === undefined}
      onClick={onRecheck}
    >
      {language === "zh" ? "重新检查计算环境" : "Check environment again"}
    </button>
  );
}
