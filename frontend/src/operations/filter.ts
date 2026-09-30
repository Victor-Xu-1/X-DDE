import { modalities, tools, type ModalityId } from "./catalog";

export type ModalityFilter = ModalityId | "all";
export type PurposeFilter = (typeof tools)[number]["group"] | "all";

export function filterCapabilities(
  modality: ModalityFilter,
  purpose: PurposeFilter,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  return tools.filter((tool) => {
    const membership: readonly ModalityId[] = tool.modalities;
    const labels = modalities
      .filter((item) => membership.includes(item.id))
      .flatMap((item) => item.label);
    return (
      (modality === "all" || membership.includes(modality)) &&
      (purpose === "all" || tool.group === purpose) &&
      [...tool.label, ...tool.note, tool.source, ...labels]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  });
}
