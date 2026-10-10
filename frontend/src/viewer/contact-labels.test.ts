import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:label-worker"),
);
afterAll(() => worker.mockRestore());
import { Vector3, type GLViewer, type Label, type LabelSpec } from "3dmol";
import { addContactLabels } from "./contact-labels";
import { nativeLabelLayer } from "./native-labels";

function fixture() {
  const labels: Label[] = [];
  const viewer = {
    getCanvas: () => ({
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 306,
        height: 520,
      }),
    }),
    modelToScreen: (points: { x: number; y: number }[]) =>
      points.map((point) => ({ x: point.x, y: point.y })),
    setLabelStyle: vi.fn(),
    addLabel: vi.fn((text: string, style: LabelSpec) => {
      const value = {
        text,
        canvas: { width: 124, height: 23 },
        sprite: {
          visible: true,
          material: {},
          scale: new Vector3(1, 1, 1),
          position: new Vector3(
            style.position?.x ?? 0,
            style.position?.y ?? 0,
            style.position?.z ?? 0,
          ),
        },
        getStyle: () => style,
        show: () => {
          value.sprite.visible = true;
        },
        hide: () => {
          value.sprite.visible = false;
        },
      } as unknown as Label;
      labels.push(value);
      return value;
    }),
    render: vi.fn(),
    removeAllLabels: vi.fn(),
  } as unknown as GLViewer;
  const layer = nativeLabelLayer(viewer);
  vi.mocked(viewer.render).mockImplementation(() => {
    layer.layout();
    return viewer;
  });
  return { viewer, layer, labels };
}
it("moves native screen offsets without moving molecular anchors or recreating textures", () => {
  const { viewer, layer, labels } = fixture();
  const rows = Array.from({ length: 5 }, (_, index) => ({
    text: "A:ASN" + index + " · 3.20 Å",
    position: { x: 150 + index, y: 250 + index, z: 2 },
  }));
  const before = structuredClone(rows);
  addContactLabels(viewer, rows);
  layer.protectLigand([{ x: 150, y: 250, z: 2 }]);
  layer.layout();
  expect(viewer.addLabel).toHaveBeenCalledTimes(5);
  expect(viewer.render).toHaveBeenCalledTimes(1);
  expect(labels.every((label) => label.sprite.material?.screenOffset)).toBe(
    true,
  );
  expect(rows).toEqual(before);
  layer.layout();
  expect(viewer.render).toHaveBeenCalledTimes(1);
});
it("drops cached contact layout on source reset so a later camera callback cannot reuse it", () => {
  const { viewer, layer } = fixture();
  addContactLabels(viewer, [
    { text: "A:ASN140 · 3.20 Å", position: { x: 150, y: 250, z: 0 } },
  ]);
  layer.clear();
  layer.layout();
  expect(viewer.render).not.toHaveBeenCalled();
});
