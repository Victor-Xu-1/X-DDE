import { render } from "@testing-library/react";
import { useRef } from "react";
import { expect, it, vi } from "vitest";
import { useReveal } from "./useReveal";
function Panel({ step }: { step: number }) {
  const node = useRef<HTMLDivElement>(null);
  useReveal(node, step);
  return (
    <div ref={node}>
      <input defaultValue="preserved" />
    </div>
  );
}
it("animates the changed step without replacing its fields and cancels obsolete entry animations", () => {
  const cancel = vi.fn(),
    animate = vi.fn(() => ({ cancel }));
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  const previous = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = animate as unknown as typeof previous;
  try {
    const view = render(<Panel step={1} />),
      input = view.container.querySelector("input");
    view.rerender(<Panel step={2} />);
    expect(view.container.querySelector("input")).toBe(input);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    render(<Panel step={1} />);
    expect(animate).toHaveBeenCalledTimes(2);
  } finally {
    HTMLElement.prototype.animate = previous;
  }
});
