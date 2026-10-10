import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:label-worker"),
);
afterAll(() => worker.mockRestore());
import { Vector3, type GLViewer, type Label } from "3dmol";
import { ContactLabelLayer } from "./contact-labels";

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
    addLabel: vi.fn((text: string, style: unknown) => {
      const value = {
        text,
        canvas: { width: 124, height: 23 },
        sprite: { visible: true, material: {}, scale: new Vector3(1, 1, 1) },
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
  } as unknown as GLViewer;
  const layer = new ContactLabelLayer(viewer);
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
  layer.add(rows);
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
it("drops label ownership on source reset so a later camera callback cannot reuse old labels", () => {
  const { viewer, layer } = fixture();
  layer.add([
    { text: "A:ASN140 · 3.20 Å", position: { x: 150, y: 250, z: 0 } },
  ]);
  layer.clear();
  layer.layout();
  expect(viewer.render).not.toHaveBeenCalled();
});
it("keeps fractional print em sizes and restores native style, scale and visibility", () => {
  const { viewer, layer, labels } = fixture();
  const row = { text: "A:ASN140 · 3.20 Å", position: { x: 150, y: 250, z: 0 } };
  layer.add([row]);
  const label = labels[0],
    oldStyle = { ...label.getStyle() };
  label.sprite.visible = false;
  label.sprite.scale.set(1.2, 1.3, 1);
  const size = (7 * 300) / 72 / 2;
  const restore = layer.printFont(size);
  expect(viewer.setLabelStyle).toHaveBeenLastCalledWith(label, {
    ...oldStyle,
    font: "Arial",
    fontSize: 15,
  });
  expect((15 * label.sprite.scale.y * 2 * 72) / 300).toBeCloseTo(7, 10);
  restore();
  expect(viewer.setLabelStyle).toHaveBeenLastCalledWith(label, oldStyle);
  expect([
    label.sprite.scale.x,
    label.sprite.scale.y,
    label.sprite.scale.z,
  ]).toEqual([1.2, 1.3, 1]);
  expect(label.sprite.visible).toBe(false);
  expect(row.position).toEqual({ x: 150, y: 250, z: 0 });
});
