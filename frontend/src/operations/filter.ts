import { tools, type ModalityId } from "./catalog";
export type ModalityFilter = ModalityId | "all";
export function filterCapabilities(modality: ModalityFilter) {
  return tools.filter(
    (tool) =>
      tool.group !== "system" &&
      (modality === "all" ||
        (tool.modalities as readonly ModalityId[]).includes(modality)),
  );
}
