import { expect, it } from "vitest";
import { moleculeReadiness } from "./molecule-readiness";

it("refuses unreviewed drawings and invalidates before a React render", () => {
  const gate = moleculeReadiness();
  expect(() => gate.checkpoint()).toThrow();
  gate.update(true);
  const checkpoint = gate.checkpoint();
  gate.update(false);
  expect(gate.available).toBe(false);
  expect(() => gate.verify(checkpoint)).toThrow();
});
it("refuses an old serialization even after a newer drawing becomes ready", () => {
  const gate = moleculeReadiness();
  gate.update(true);
  const checkpoint = gate.checkpoint();
  gate.update(false);
  gate.update(true);
  expect(() => gate.verify(checkpoint)).toThrow();
  expect(() => gate.verify(gate.checkpoint())).not.toThrow();
});
