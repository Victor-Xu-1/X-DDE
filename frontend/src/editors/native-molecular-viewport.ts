/** Camera adapter for the native small-molecule renderer; never moves atoms. */
type Point = { x: number; y: number };
type ViewBox = { minX: number; minY: number; width: number; height: number };
type Structure = { getCoordBoundingBox(): { min: Point; max: Point } };
type NativeViewport = {
  struct(): Structure;
  zoom(value: number): unknown;
  zoomAccordingContent(structure: Structure): unknown;
  render: {
    clientArea: Element;
    options: { microModeScale: number };
    resizeViewBox(): void;
    setViewBox(update: (current: ViewBox) => ViewBox): void;
  };
  event: { zoomChanged: { dispatch(): unknown } };
};

export function createMolecularViewport(value: unknown) {
  const editor = value as NativeViewport | null;
  if (
    typeof editor?.struct !== "function" ||
    typeof editor.zoom !== "function" ||
    typeof editor.zoomAccordingContent !== "function" ||
    typeof editor.render?.resizeViewBox !== "function" ||
    typeof editor.render.setViewBox !== "function" ||
    typeof editor.render.options?.microModeScale !== "number" ||
    typeof editor.render.clientArea?.getBoundingClientRect !== "function" ||
    typeof editor.event?.zoomChanged?.dispatch !== "function"
  )
    throw new Error(
      "Update the drawing component to support molecular viewport fitting.",
    );

  return {
    resetZoom() {
      editor.zoom(1);
      editor.event.zoomChanged.dispatch();
    },
    fit() {
      const bounds = editor.render.clientArea.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return false;
      const structure = editor.struct();
      const box = structure.getCoordBoundingBox();
      const scale = editor.render.options.microModeScale;
      const center = {
        x: (box.min.x + box.max.x) / 2,
        y: (box.min.y + box.max.y) / 2,
      };
      if (
        !Number.isFinite(scale) ||
        scale <= 0 ||
        !Number.isFinite(center.x) ||
        !Number.isFinite(center.y)
      )
        throw new Error("The molecular viewport dimensions are unavailable.");
      editor.render.resizeViewBox();
      editor.zoom(1);
      editor.zoomAccordingContent(structure);
      // Native Scale.modelToCanvas uses microModeScale. The legacy shared
      // Coordinates helper uses macroModeScale and miscenters this editor.
      editor.render.setViewBox((current) => ({
        ...current,
        minX: center.x * scale - current.width / 2,
        minY: center.y * scale - current.height / 2,
      }));
      editor.event.zoomChanged.dispatch();
      return true;
    },
  };
}
