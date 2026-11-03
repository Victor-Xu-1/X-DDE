import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePredictionHeadingFocus } from "./prediction-heading-focus";

function Study() {
  const root = usePredictionHeadingFocus(true);
  return (
    <div className="studio-app">
      <header className="studio-topbar" />
      <div ref={root}>
        <h2 className="questionnaire-heading" tabIndex={-1}>
          Current step
        </h2>
        <input aria-label="Preserved field" defaultValue="STAT6" />
      </div>
    </div>
  );
}
afterEach(() => vi.restoreAllMocks());
function scheduler() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const cancel = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => {});
  const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        left: 0,
        right: 400,
        width: 400,
        top: this.classList.contains("studio-topbar") ? 0 : 50,
        bottom: this.classList.contains("studio-topbar") ? 112 : 78,
        height: this.classList.contains("studio-topbar") ? 112 : 28,
        toJSON: () => ({}),
      };
    },
  );
  return { frames, cancel, scroll };
}
it("clears the current toolbar without replacing focus or the entered field", () => {
  const { frames, scroll } = scheduler();
  render(<Study />);
  const heading = screen.getByRole("heading", { name: "Current step" });
  const input = screen.getByRole("textbox", { name: "Preserved field" });
  act(() => heading.focus());
  act(() => frames[0](0));
  expect(scroll).toHaveBeenCalledWith({ top: -78, behavior: "instant" });
  expect(document.activeElement).toBe(heading);
  expect(input).toHaveValue("STAT6");
});
it("does not scroll a stale step after focus moves and cancels work on unmount", () => {
  const { frames, cancel, scroll } = scheduler();
  const view = render(<Study />);
  act(() => screen.getByRole("heading", { name: "Current step" }).focus());
  act(() => screen.getByRole("textbox", { name: "Preserved field" }).focus());
  act(() => frames[0](0));
  expect(scroll).not.toHaveBeenCalled();
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(1);
});
