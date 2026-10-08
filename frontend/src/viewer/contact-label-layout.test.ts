import { expect, it } from "vitest";
import { contactLabelLayout, type LabelBox } from "./contact-label-layout";
const overlap = (a: LabelBox, b: LabelBox) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

it.each([306, 550, 740])(
  "separates clustered labels in a %i-pixel viewport without covering the ligand",
  (width) => {
    const anchors = Array.from({ length: 5 }, (_, index) => ({
      x: width / 2 + index,
      y: 250 + index,
      width: 124,
      height: 23,
    }));
    const ligand = { x: width / 2 - 30, y: 235, width: 60, height: 50 };
    const before = structuredClone({ anchors, ligand });
    const boxes = contactLabelLayout(anchors, { width, height: 520 }, ligand);
    expect(boxes.filter(Boolean)).toHaveLength(5);
    for (const [index, box] of boxes.entries()) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(overlap(box!, ligand)).toBe(false);
      for (const other of boxes.slice(index + 1))
        expect(overlap(box!, other!)).toBe(false);
    }
    expect({ anchors, ligand }).toEqual(before);
  },
);
it("keeps excess labels absent when there is no room, without changing source anchors", () => {
  const anchors = Array.from({ length: 60 }, () => ({
    x: 100,
    y: 80,
    width: 130,
    height: 25,
  }));
  const boxes = contactLabelLayout(anchors, { width: 210, height: 160 }, null);
  expect(boxes.filter(Boolean).length).toBeLessThan(60);
  expect(boxes.filter(Boolean).length).toBeGreaterThan(0);
  expect(boxes).toHaveLength(anchors.length);
});
it("does not invent positions for invalid projection or zero-size viewports", () => {
  expect(
    contactLabelLayout(
      [{ x: NaN, y: 2, width: 100, height: 20 }],
      { width: 300, height: 400 },
      null,
    ),
  ).toEqual([null]);
  expect(
    contactLabelLayout(
      [{ x: 30, y: 20, width: 100, height: 20 }],
      { width: 0, height: 0 },
      null,
    ),
  ).toEqual([null]);
});
