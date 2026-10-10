import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:native-label-worker"),
);
afterAll(() => worker.mockRestore());
import { Vector3, type GLViewer, type Label, type LabelSpec } from "3dmol";
import { NativeLabelLayer } from "./native-labels";

function fixture() {
  const styles = new WeakMap<Label, LabelSpec>();
  const viewer = {
    addLabel: vi.fn((text: string, style: LabelSpec) => {
      const label = {
        text,
        sprite: { scale: new Vector3(1, 1, 1), visible: true },
        getStyle: () => styles.get(label)!,
      } as unknown as Label;
      styles.set(label, style);
      return label;
    }),
    setLabelStyle: vi.fn((label: Label, style: LabelSpec) => {
      styles.set(label, style);
      // The native SDK rebuilds the sprite, resetting its scale and visibility.
      label.sprite.scale = new Vector3(1, 1, 1);
      label.sprite.visible = true;
    }),
    removeAllLabels: vi.fn(),
  } as unknown as GLViewer;
  return { viewer, layer: new NativeLabelLayer(viewer) };
}

it("calibrates every annotation kind without changing scientific text, anchors or hidden choices", () => {
  const { layer } = fixture();
  const text = [
    "A:ASN140 · 3.20 Å",
    "A:GLN590",
    "2.90 Å",
    "0.90 Å",
    "C32 → C33",
  ];
  const original = text.map((_, index) => ({
    position: { x: index, y: 2, z: 3 },
    fontSize: 12 + index,
    fontColor: "#805511",
    showBackground: false,
  }));
  const labels = text.map((value, index) => layer.add(value, original[index]));
  labels[4].sprite.visible = false;
  labels[4].sprite.scale.set(1.2, 1.3, 1);
  const restore = layer.printFont((7 * 300) / 72, 2);
  for (const [index, label] of labels.entries()) {
    expect(label.text).toBe(text[index]);
    expect(label.getStyle().position).toEqual(original[index].position);
    expect(label.getStyle().fontColor).toBe(original[index].fontColor);
    expect(
      (Number(label.getStyle().fontSize) * label.sprite.scale.y * 2 * 72) / 300,
    ).toBeCloseTo(7, 10);
    expect(label.sprite.scale.y * 2).toBeLessThanOrEqual(1);
  }
  expect(labels[4].sprite.visible).toBe(false);
  restore();
  labels.forEach((label, index) =>
    expect(label.getStyle()).toEqual(original[index]),
  );
  expect(labels[4].sprite.scale).toEqual(new Vector3(1.2, 1.3, 1));
  expect(labels[4].sprite.visible).toBe(false);
});

it("releases old labels before a source change so export cannot alter a disposed scene", () => {
  const { viewer, layer } = fixture();
  layer.add("A:ASN140", { fontSize: 12 });
  layer.clear();
  layer.printFont((7 * 600) / 72, 2)();
  expect(viewer.removeAllLabels).toHaveBeenCalledOnce();
  expect(viewer.setLabelStyle).not.toHaveBeenCalled();
});

it("rejects invalid print dimensions before changing native annotations", () => {
  const { viewer, layer } = fixture();
  layer.add("2.90 Å", { fontSize: 13 });
  for (const [size, ratio] of [
    [0, 2],
    [NaN, 2],
    [12, 0],
    [12, Infinity],
  ])
    expect(() => layer.printFont(size, ratio)).toThrow(
      "Invalid printed label size",
    );
  expect(viewer.setLabelStyle).not.toHaveBeenCalled();
});

it("restores every annotation after one native text update fails", () => {
  const { viewer, layer } = fixture();
  const originals = [{ fontSize: 12 }, { fontSize: 13 }];
  const labels = originals.map((style, index) =>
    layer.add(String(index) + " Å", style),
  );
  const update = vi.mocked(viewer.setLabelStyle).getMockImplementation()!;
  vi.mocked(viewer.setLabelStyle)
    .mockImplementationOnce(update)
    .mockImplementationOnce(() => {
      throw new Error("context unavailable");
    });
  expect(() => layer.printFont((7 * 600) / 72, 2)).toThrow(
    "context unavailable",
  );
  labels.forEach((label, index) =>
    expect(label.getStyle()).toEqual(originals[index]),
  );
});
