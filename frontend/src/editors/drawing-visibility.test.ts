import { expect, it } from "vitest";
import { drawingVisibility } from "./drawing-visibility";

it("styles only the unreviewed scene and restores its own attribute on teardown", () => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML =
    '<button>Undo</button><div role="application"><svg></svg></div>';
  const original = doc.body.innerHTML;
  const view = drawingVisibility(doc);
  view.show(false);
  expect(doc.documentElement.getAttribute("data-xdde-drawing-visible")).toBe(
    "false",
  );
  expect(doc.head.querySelector("style")!.textContent).toContain(
    '[role="application"]',
  );
  expect(doc.body.innerHTML).toBe(original);
  view.show(true);
  view.dispose();
  expect(doc.documentElement.hasAttribute("data-xdde-drawing-visible")).toBe(
    false,
  );
  expect(doc.head.querySelector("style")).toBeNull();
});

it("does not overwrite another owner changing the visibility attribute", () => {
  const doc = document.implementation.createHTMLDocument();
  const view = drawingVisibility(doc);
  view.show(false);
  doc.documentElement.setAttribute(
    "data-xdde-drawing-visible",
    "another-owner",
  );
  view.dispose();
  expect(doc.documentElement.getAttribute("data-xdde-drawing-visible")).toBe(
    "another-owner",
  );
});
