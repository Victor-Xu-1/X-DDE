export type EnvironmentTab = "components" | "runtime";

export function environmentHash(tab: EnvironmentTab) {
  return tab === "runtime"
    ? "#view=deployment&tab=runtime"
    : "#view=deployment";
}

export function environmentTabFromHash(hash: string): EnvironmentTab | null {
  const params = new URLSearchParams(hash.slice(1));
  const view = params.get("view");
  if (view === "new" && params.get("tool") === "resources") return "runtime";
  if (view !== "deployment") return null;
  return params.get("tab") === "runtime" ? "runtime" : "components";
}
