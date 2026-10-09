import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ActiveIndicator } from "./ActiveIndicator";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Track({ active }: { active: string }) {
  const node = useRef<HTMLDivElement>(null);
  return (
    <div ref={node} data-kind="track">
      <input defaultValue="retained input" />
      <button data-kind="first" aria-selected={active === "a"}>
        First
      </button>
      <button data-kind="second" aria-selected={active === "b"}>
        Second
      </button>
      <ActiveIndicator container={node} selection={active} />
    </div>
  );
}
it("tracks the selected control on wrapped rows without replacing existing input", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const kind = this.dataset.kind;
      return new DOMRect(
        kind === "second" ? 110 : 10,
        kind === "second" ? 60 : 20,
        kind === "track" ? 240 : 80,
        30,
      );
    },
  );
  const view = render(<Track active="a" />),
    input = view.container.querySelector("input");
  const indicator = () =>
    view.container.querySelector<HTMLElement>(".active-control-indicator")!;
  expect(indicator().style.transform).toBe("translate(0px, 28px)");
  view.rerender(<Track active="b" />);
  expect(indicator().style.transform).toBe("translate(100px, 68px)");
  expect(view.container.querySelector("input")).toBe(input);
  expect(screen.getByRole("textbox")).toHaveValue("retained input");
});
