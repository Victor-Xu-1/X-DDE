export function supplierLabel(value: unknown, zh: boolean) {
  if (value === "custom") return zh ? "研究库" : "Research library";
  if (value === "del") return zh ? "DNA 编码库" : "DNA-encoded library";
  return typeof value === "string" && value.trim() ? value : "—";
}
