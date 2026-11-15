import { expect, it } from "vitest";
import { drawingErrorOwner, moleculeReadiness } from "./molecule-readiness";

it("refuses unreviewed drawings and invalidates before a React render", () => {
  const gate = moleculeReadiness();
  expect(() => gate.checkpoint()).toThrow();
  gate.update(true);
  const checkpoint = gate.checkpoint();
  gate.update(false);
  expect(gate.available).toBe(false);
  expect(() => gate.verify(checkpoint)).toThrow();
});

it("clears the editor's recovered error but preserves a later unrelated error", () => {
  let current = "";
  const editorError = drawingErrorOwner((update) => {
    current = update(current);
  });
  editorError("drawing could not be prepared");
  expect(current).toBe("drawing could not be prepared");
  editorError("");
  expect(current).toBe("");
  editorError("drawing could not be prepared");
  current = "image upload failed";
  editorError("");
  expect(current).toBe("image upload failed");
  editorError("");
  expect(current).toBe("image upload failed");
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
