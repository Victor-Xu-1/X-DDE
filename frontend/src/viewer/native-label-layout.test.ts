import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:layout-worker"),
);
afterAll(() => worker.mockRestore());
import { Vector3, type GLViewer, type Label } from "3dmol";
import {
  layoutNativeLabels,
  type NativeAnnotation,
} from "./native-label-layout";

function fixture() {
  const viewer = {
    getCanvas: () => ({
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 600,
        height: 500,
      }),
    }),
    modelToScreen: (points: { x: number; y: number }[]) =>
      points.map((p) => ({ ...p })),
  } as unknown as GLViewer;
  const entries: NativeAnnotation[] = Array.from({ length: 8 }, (_, index) => {
    const style = {};
    return {
      layoutHidden: false,
      label: {
        canvas: { width: 120, height: 35 },
        sprite: {
          position: new Vector3(300 + index, 250, 2),
          scale: new Vector3(1, 1, 1),
          visible: true,
          material: {},
        },
        getStyle: () => style,
      } as unknown as Label,
    };
  });
  return { viewer, entries };
}
it("places mixed annotations without overlap, preserving their original molecular positions", () => {
  const { viewer, entries } = fixture(),
    original = entries.map((e) => e.label.sprite.position.clone());
  expect(layoutNativeLabels(viewer, entries, [{ x: 310, y: 250, z: 2 }])).toBe(
    true,
  );
  const boxes = entries
    .filter((e) => e.label.sprite.visible)
    .map(({ label }) => {
      const offset = label.sprite.material!.screenOffset!;
      return {
        x: label.sprite.position.x + offset.x,
        y: label.sprite.position.y - offset.y,
        width: 120,
        height: 35,
      };
    });
  expect(boxes.length).toBeGreaterThan(4);
  boxes.forEach((a, index) =>
    boxes
      .slice(index + 1)
      .forEach((b) =>
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true),
      ),
  );
  entries.forEach((entry, index) =>
    expect(entry.label.sprite.position).toEqual(original[index]),
  );
  expect(layoutNativeLabels(viewer, entries, [{ x: 310, y: 250, z: 2 }])).toBe(
    false,
  );
});
it("preserves a manually hidden annotation instead of treating it as crowding", () => {
  const { viewer, entries } = fixture();
  entries[0].label.sprite.visible = false;
  layoutNativeLabels(viewer, entries, []);
  expect(entries[0].label.sprite.visible).toBe(false);
  expect(entries[0].layoutHidden).toBe(false);
});
