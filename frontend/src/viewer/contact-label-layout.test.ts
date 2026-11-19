import { expect, it } from "vitest";
import {
  contactLabelLayout,
  labelLeaderEndpoint,
  type LabelBox,
} from "./contact-label-layout";
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

it.each([1, 2])("uses clear print margins at raster scale %i", (scale) => {
  const ribbon = {
    x: 190 * scale,
    y: 28 * scale,
    width: 225 * scale,
    height: 305 * scale,
  };
  const ligand = {
    x: 296 * scale,
    y: 180 * scale,
    width: 40 * scale,
    height: 44 * scale,
  };
  const anchors = [156, 184, 209, 235, 260].map((y) => ({
    x: 294 * scale,
    y: y * scale,
    width: 145 * scale,
    height: 24 * scale,
  }));
  const occupied = (box: LabelBox) => Number(overlap(box, ribbon));
  const boxes = contactLabelLayout(
    anchors,
    { width: 600 * scale, height: 400 * scale },
    ligand,
    occupied,
  );
  expect(boxes.filter(Boolean)).toHaveLength(anchors.length);
  for (const box of boxes) {
    expect(occupied(box!)).toBe(0);
    expect(overlap(box!, ligand)).toBe(false);
  }
  for (const [index, anchor] of anchors.entries()) {
    const endpoint = labelLeaderEndpoint(anchor, boxes[index]!);
    for (let fraction = 0; fraction < 1; fraction += 0.02) {
      const x = anchor.x + fraction * (endpoint.x - anchor.x);
      const y = anchor.y + fraction * (endpoint.y - anchor.y);
      for (const other of boxes.filter((_, row) => row !== index)) {
        expect(overlap({ x, y, width: 0, height: 0 }, other!)).toBe(false);
      }
    }
  }
});

it("gives a measurement in empty space a visible leader and protects its anchor", () => {
  const anchor = { x: 300, y: 200, width: 120, height: 25 };
  const [box] = contactLabelLayout(
    [anchor], { width: 600, height: 400 }, null, () => 0,
  );
  expect(box).not.toBeNull();
  const end = labelLeaderEndpoint(anchor, box!);
  expect(Math.hypot(end.x - anchor.x, end.y - anchor.y)).toBeGreaterThanOrEqual(3);
});
