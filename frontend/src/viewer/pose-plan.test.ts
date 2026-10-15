import { expect, it } from "vitest";
import { posePlan } from "./pose-plan";

it("keeps exact source selection separate from its editable pose session", () => {
  const id = "7b9bd02b-0b93-45f4-a8b9-80e1cff203c9";
  const frame = { urls: [`/api/assets/${id}`], records: [2] };
  const editable = posePlan(frame);
  expect(editable.base.source).toEqual({
    kind: "asset",
    asset_id: id,
    record: 2,
  });
  const source = posePlan({ ...frame, sourceSnapshot: true });
  expect(source.base.urls).toEqual(frame.urls);
  expect(source.base.records).toEqual([2]);
  expect(source.base.source).toBeNull();
  expect(source.base.receptor).toBeNull();
  expect(source.key).not.toBe(editable.key);
});
