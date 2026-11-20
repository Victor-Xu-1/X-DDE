import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchTabs } from "./ResearchTabs";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("switches visible panels by click and keyboard while retaining an edited input", async () => {
  const user = userEvent.setup();
  render(
    <ResearchTabs
      label="Research views"
      tabs={[
        {
          id: "table",
          label: "Candidates",
          content: <input aria-label="Research note" defaultValue="" />,
        },
        { id: "structure", label: "Structure", content: <p>Structure view</p> },
      ]}
    />,
  );
  await user.type(screen.getByRole("textbox"), "Keep this candidate");
  await user.click(screen.getByRole("tab", { name: "Structure" }));
  expect(screen.getByRole("tabpanel", { name: "Structure" })).toBeVisible();
  expect(screen.queryByRole("textbox")).toBeNull();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "Candidates" })).toHaveFocus();
  expect(screen.getByRole("textbox")).toHaveValue("Keep this candidate");
  await user.keyboard("{End}");
  expect(screen.getByRole("tabpanel", { name: "Structure" })).toBeVisible();
});

it("mounts only the chosen controlled view on a fresh molecular source", async () => {
  const user = userEvent.setup();
  const tabs = [
    { id: "3d", label: "3D", content: <div data-testid="native-3d" /> },
    { id: "2d", label: "2D", content: <div data-testid="native-2d" /> },
  ];
  const { rerender } = render(
    <ResearchTabs label="Structure" active="2d" tabs={tabs} />,
  );
  expect(screen.getByRole("tab", { name: "2D" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByTestId("native-2d")).toBeVisible();
  expect(screen.queryByTestId("native-3d")).toBeNull();
  rerender(<ResearchTabs label="Structure" active="3d" tabs={tabs} />);
  expect(screen.getByTestId("native-3d")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "2D" }));
  // A controlled tab still follows its owner rather than a local click.
  expect(screen.getByTestId("native-3d")).toBeVisible();
});

it("keeps tab navigation and compact result actions independently accessible", async () => {
  const user = userEvent.setup();
  const onPrepare = vi.fn();
  render(
    <ResearchTabs
      label="Structure views"
      toolbar={<button onClick={onPrepare}>Prepare selected molecule</button>}
      tabs={[
        {
          id: "2d",
          label: "2D structure",
          shortLabel: "2D",
          content: "Drawing",
        },
        { id: "3d", label: "3D structure", shortLabel: "3D", content: "Model" },
      ]}
    />,
  );
  const tab = screen.getByRole("tab", { name: "2D structure" });
  expect(tab).toHaveTextContent("2D");
  const prepare = screen.getByRole("button", {
    name: "Prepare selected molecule",
  });
  expect(screen.getByRole("tablist")).not.toContainElement(prepare);
  tab.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "3D structure" })).toHaveFocus();
  expect(screen.getByRole("tabpanel", { name: "3D structure" })).toBeVisible();
  await user.click(prepare);
  expect(onPrepare).toHaveBeenCalledOnce();
});

function trackGeometry() {
  const state = {
    width: 500,
    start: 300,
    tabWidth: 120,
    hidden: false,
    rtl: false,
  };
  const observers: {
    callback: () => void;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: () => void) {
        observers.push({ callback, disconnect: this.disconnect });
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute("role") === "tablist" && !state.hidden
        ? state.width
        : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const track =
        this.getAttribute("role") === "tablist" ? this : this.parentElement;
      const selected =
        this.getAttribute("role") === "tab" &&
        this.textContent?.startsWith("Structure");
      return new DOMRect(
        20 +
          (selected ? state.start : 0) -
          (this === track ? 0 : (track?.scrollLeft ?? 0)),
        200,
        state.hidden ? 0 : this === track ? state.width : state.tabWidth,
        44,
      );
    },
  );
  const originalStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((node, pseudo) => {
    const style = originalStyle(node, pseudo);
    if (node.getAttribute("role") === "tablist")
      Object.defineProperty(style, "direction", {
        value: state.rtl ? "rtl" : "ltr",
      });
    return style;
  });
  return {
    state,
    observers,
    resize: () => act(() => observers.forEach(({ callback }) => callback())),
  };
}

function measuredTabs(count = 1) {
  return [
    {
      id: "table",
      label: "Candidates",
      content: (
        <input aria-label="Retained note" defaultValue="Original note" />
      ),
    },
    {
      id: "structure",
      label: "Structure",
      count,
      content: <iframe title="Native structure" src="about:blank" />,
    },
  ];
}

it("reveals selection after resize with reduced motion without moving focus or remounting native panels", async () => {
  const { state, resize, observers } = trackGeometry();
  const pageScroll = vi.spyOn(window, "scrollTo");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  const changed = vi.fn();
  const view = render(
    <ResearchTabs
      label="Views"
      active="structure"
      onChange={changed}
      tabs={measuredTabs()}
    />,
  );
  const track = screen.getByRole("tablist"),
    frame = screen.getByTitle("Native structure");
  expect(track.scrollLeft).toBe(0);
  screen.getByRole("tabpanel").focus();
  state.width = 260;
  resize();
  expect(track.scrollLeft).toBe(160);
  expect(screen.getByRole("tabpanel")).toHaveFocus();
  expect(screen.getByTitle("Native structure")).toBe(frame);
  expect(changed).not.toHaveBeenCalled();
  expect(pageScroll).not.toHaveBeenCalled();
  // Repeated measurements must not jitter or override free horizontal browsing.
  resize();
  expect(track.scrollLeft).toBe(160);
  track.scrollLeft = 0;
  view.rerender(
    <ResearchTabs label="Views" active="structure" tabs={measuredTabs()} />,
  );
  expect(track.scrollLeft).toBe(0);
  view.unmount();
  expect(
    observers.every(({ disconnect }) => disconnect.mock.calls.length > 0),
  ).toBe(true);
});

it("remeasures count and label geometry and retains externally selected native views and notes", async () => {
  const user = userEvent.setup(),
    { state } = trackGeometry();
  const view = render(
    <ResearchTabs label="Views" active="table" tabs={measuredTabs()} />,
  );
  const note = screen.getByRole("textbox");
  await user.type(note, " edited");
  view.rerender(
    <ResearchTabs label="Views" active="structure" tabs={measuredTabs()} />,
  );
  const frame = screen.getByTitle("Native structure");
  state.start = 480;
  view.rerender(
    <ResearchTabs label="Views" active="structure" tabs={measuredTabs(200)} />,
  );
  expect(screen.getByRole("tablist").scrollLeft).toBe(100);
  view.rerender(
    <ResearchTabs label="Views" active="table" tabs={measuredTabs(200)} />,
  );
  expect(screen.getByRole("textbox")).toBe(note);
  expect(note).toHaveValue("Original note edited");
  expect(screen.getByTitle("Native structure")).toBe(frame);
  view.rerender(
    <ResearchTabs label="Views" active="structure" tabs={measuredTabs(200)} />,
  );
  expect(screen.getByTitle("Native structure")).toBe(frame);
});

it("ignores hidden tracks then reveals them, with deterministic oversized labels and current fallback", () => {
  const { state, resize } = trackGeometry();
  state.hidden = true;
  state.width = 200;
  state.tabWidth = 320;
  const view = render(
    <ResearchTabs label="Views" active="structure" tabs={measuredTabs()} />,
  );
  const track = screen.getByRole("tablist");
  expect(track.scrollLeft).toBe(0);
  state.hidden = false;
  resize();
  expect(track.scrollLeft).toBe(300);
  resize();
  expect(track.scrollLeft).toBe(300);
  view.rerender(
    <ResearchTabs label="Views" active="missing" tabs={measuredTabs()} />,
  );
  expect(screen.getByRole("tab", { name: "Candidates" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(track.scrollLeft).toBe(0);
  view.rerender(<ResearchTabs label="Views" tabs={[]} />);
  expect(screen.queryByRole("tab")).toBeNull();
});

it("uses the horizontal RTL range and falls back to window resize when observers are unavailable", () => {
  const { state } = trackGeometry();
  vi.stubGlobal("ResizeObserver", undefined);
  state.rtl = true;
  state.width = 260;
  state.start = -150;
  const view = render(
    <ResearchTabs label="Views" active="structure" tabs={measuredTabs()} />,
  );
  const track = screen.getByRole("tablist");
  expect(track.scrollLeft).toBe(-150);
  state.start = -200;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(track.scrollLeft).toBe(-200);
  view.unmount();
  state.start = -300;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(track.scrollLeft).toBe(-200);
});

it("clamps corrections to the LTR and RTL track endpoints", () => {
  const { state, resize } = trackGeometry();
  state.start = 2000;
  const view = render(
    <ResearchTabs label="Views" active="structure" tabs={measuredTabs()} />,
  );
  const track = screen.getByRole("tablist");
  expect(track.scrollLeft).toBe(400);
  state.start = -2000;
  resize();
  expect(track.scrollLeft).toBe(0);
  state.rtl = true;
  resize();
  expect(track.scrollLeft).toBe(-400);
  state.start = 2000;
  resize();
  expect(track.scrollLeft).toBe(0);
  view.unmount();
});
