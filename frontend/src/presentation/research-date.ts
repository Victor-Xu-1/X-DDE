import type { Language } from "../types";

/** Show the recorded source time; missing dates never become an invented date. */
export function researchDate(
  value: string | null | undefined,
  language: Language,
) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date)
    : "";
}
