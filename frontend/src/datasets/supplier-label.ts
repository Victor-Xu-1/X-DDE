export function supplierLabel(value: unknown, zh: boolean) {
  if (value === "custom") return zh ? "研究库" : "Research library";
  return typeof value === "string" && value.trim() ? value : "—";
}
