import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StructureWorkbench } from "./StructureWorkbench";
import { WorkspaceFullscreenControl } from "./WorkspaceFullscreenControl";

let enter: ReturnType<typeof vi.fn>, exit: ReturnType<typeof vi.fn>;
const mounts = vi.fn();
function nativeClose(target: HTMLElement) {
  target.style.display = "";
  const event = Object.assign(new Event("toggle"), { newState: "closed" });
  target.dispatchEvent(event);
}
function Preview({
  language = "en",
  surfaceClass = "viewer-panel",
}: {
  language?: "en" | "zh";
  surfaceClass?: string;
}) {
  useEffect(() => {
    mounts();
  }, []);
  return (
    <section className={surfaceClass}>
      <WorkspaceFullscreenControl language={language} structureFocus />
      <div className="molecular-stage">
        <iframe title="Native scene" />
      </div>
    </section>
  );
}
function Workbench({ language = "en" }: { language?: "en" | "zh" }) {
  const [selected, select] = useState("Pose 1");
  return (
    <StructureWorkbench preview={<Preview language={language} />}>
      <label>
        Selected pose
        <select value={selected} onChange={(e) => select(e.target.value)}>
          <option>Pose 1</option>
          <option>Pose 2</option>
        </select>
      </label>
    </StructureWorkbench>
  );
}
const openButton = () =>
  screen.getByRole("button", { name: "Expand research workspace" });
const closeButton = () =>
  screen.getByRole("button", { name: "Close expanded view" });
beforeEach(() => {
  mounts.mockClear();
  // JSDOM has the popover hidden UA style, but no working top-layer API.
  enter = vi.fn(function (this: HTMLElement) {
    this.style.display = "block";
  });
  exit = vi.fn(function (this: HTMLElement) {
    nativeClose(this);
  });
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    configurable: true,
    value: enter,
  });
  Object.defineProperty(HTMLElement.prototype, "hidePopover", {
    configurable: true,
    value: exit,
  });
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    await Promise.resolve();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
  delete (HTMLElement.prototype as { hidePopover?: unknown }).hidePopover;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

it.each(["en", "zh"] as const)(
  "expands the same live workspace without native fullscreen in %s",
  async (language) => {
    const user = userEvent.setup();
    const native = vi.fn(() => {
      throw new Error("Denied fullscreen");
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: native,
    });
    const { container } = render(<Workbench language={language} />);
    const scene = screen.getByTitle("Native scene");
    await user.selectOptions(screen.getByRole("combobox"), "Pose 2");
    const button = screen.getByRole("button", {
      name: language === "zh" ? "展开研究工作区" : "Expand research workspace",
    });
    await user.click(button);
    const dialog = screen.getByRole("dialog", {
      name:
        language === "zh" ? "结构研究工作区" : "Structure research workspace",
    });
    expect(dialog).toBe(container.querySelector(".structure-workbench"));
    expect(enter.mock.instances[0]).toBe(dialog);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-workspace-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "关闭展开视图" : "Close expanded view",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveValue("Pose 2");
    expect(screen.getByTitle("Native scene")).toBe(scene);
    expect(mounts).toHaveBeenCalledOnce();
    expect(button).toHaveFocus();
    expect(native).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as { requestFullscreen?: unknown })
      .requestFullscreen;
  },
);

class DesktopMedia extends EventTarget {
  matches = true;
}

it("keeps the expanded focus when a coordinated comparison switches rendering modes", async () => {
  vi.stubGlobal("matchMedia", () => new DesktopMedia());
  function Comparison() {
    const [paired, setPaired] = useState(true);
    return (
      <StructureWorkbench
        preview={
          <div data-structure-focus-group>
            <button onClick={() => setPaired(!paired)}>
              Toggle comparison
            </button>
            <WorkspaceFullscreenControl language="en" structureFocus />
            {(paired ? ["A", "B"] : ["Overlay"]).map((name) => (
              <section key={name} className="simulation-molecular-viewport">
                <div className="simulation-webgl" aria-label={name} />
              </section>
            ))}
          </div>
        }
      >
        Analysis
      </StructureWorkbench>
    );
  }
  const user = userEvent.setup();
  render(<Comparison />);
  const toggle = screen.getByRole("button", { name: "Toggle comparison" });
  await user.click(openButton());
  await user.click(screen.getByRole("button", { name: "Focus structure" }));
  const dialog = screen.getByRole("dialog");
  const focused = "--focused-structure-height";
  const original = screen.getByLabelText("A");
  expect(original.style.getPropertyValue(focused)).not.toBe("");
  await user.click(toggle);
  await waitFor(() =>
    expect(
      screen.getByLabelText("Overlay").style.getPropertyValue(focused),
    ).not.toBe(""),
  );
  expect(original.style.getPropertyValue(focused)).toBe("");
  expect(dialog).toHaveAttribute("data-workspace-focus", "true");
  await user.click(toggle);
  await waitFor(() =>
    expect(screen.getByLabelText("B").style.getPropertyValue(focused)).not.toBe(
      "",
    ),
  );
  const current = screen.getByLabelText("B");
  await user.click(screen.getByRole("button", { name: "Show analysis panel" }));
  expect(dialog).not.toHaveAttribute("data-workspace-focus");
  expect(current.style.getPropertyValue(focused)).toBe("");
});

it("focuses one scene, retains analysis inputs and resets focus mode on Escape", async () => {
  vi.stubGlobal("matchMedia", () => new DesktopMedia());
  const user = userEvent.setup();
  render(<Workbench />);
  const scene = screen.getByTitle<HTMLIFrameElement>("Native scene");
  await user.selectOptions(screen.getByRole("combobox"), "Pose 2");
  await user.click(openButton());
  const dialog = screen.getByRole("dialog");
  const focus = screen.getByRole("button", { name: "Focus structure" });
  await user.click(focus);
  expect(dialog).toHaveAttribute("data-workspace-focus", "true");
  expect(focus).toHaveAccessibleName("Show analysis panel");
  expect(focus).toHaveFocus();
  expect(screen.getByTitle("Native scene")).toBe(scene);
  await user.click(focus);
  expect(dialog).not.toHaveAttribute("data-workspace-focus");
  expect(screen.getByRole("combobox")).toHaveValue("Pose 2");
  await user.click(focus);
  fireEvent.keyDown(scene.contentDocument!, { key: "Escape" });
  expect(dialog).not.toHaveAttribute("data-workspace-focus");
  expect(openButton()).toHaveFocus();
  expect(mounts).toHaveBeenCalledOnce();
});

it("returns to the new view when its tab hides the expanded scene and its controls", async () => {
  vi.stubGlobal("matchMedia", () => new DesktopMedia());
  function Views() {
    const [drawing, showDrawing] = useState(false);
    return (
      <StructureWorkbench
        preview={
          <>
            <button onClick={() => showDrawing(!drawing)}>Change view</button>
            <div hidden={drawing}>
              <Preview />
            </div>
            {drawing && <p>2D drawing</p>}
          </>
        }
      >
        Analysis
      </StructureWorkbench>
    );
  }
  const user = userEvent.setup();
  render(<Views />);
  await user.click(openButton());
  await user.click(screen.getByRole("button", { name: "Focus structure" }));
  const tab = screen.getByRole("button", { name: "Change view" });
  await user.click(tab);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("2D drawing")).toBeVisible();
  expect(tab).toHaveFocus();
});

it("expands a loading scene, contains focus and restores pre-existing inert/scroll state", async () => {
  const user = userEvent.setup();
  document.body.style.overflow = "clip";
  document.documentElement.style.overflow = "scroll";
  const { container } = render(
    <>
      <button>Outside</button>
      <Workbench />
      <aside inert>Already unavailable</aside>
    </>,
  );
  const outside = screen.getByRole("button", { name: "Outside" });
  const previouslyInert = container.querySelector("aside")!;
  const button = openButton();
  await user.click(button);
  expect(outside).toHaveAttribute("inert");
  outside.focus();
  expect(button).toHaveFocus();
  const last = screen.getByRole("combobox");
  last.focus();
  await user.keyboard("{Tab}");
  expect(closeButton()).toHaveFocus();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(last).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(outside).not.toHaveAttribute("inert");
  expect(previouslyInert).toHaveAttribute("inert");
  expect(document.body.style.overflow).toBe("clip");
  expect(document.documentElement.style.overflow).toBe("scroll");
  expect(button).toHaveFocus();
});

it("leaves a nested figure dialog to handle Escape, then closes from the native scene document", async () => {
  const user = userEvent.setup();
  render(<Workbench />);
  await user.click(openButton());
  const nested = document.createElement("dialog");
  nested.open = true;
  document.body.append(nested);
  try {
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Structure research workspace" }),
    ).toBeVisible();
  } finally {
    nested.remove();
  }
  const frame = screen.getByTitle<HTMLIFrameElement>("Native scene");
  fireEvent.keyDown(frame.contentDocument!, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(openButton()).toHaveFocus();
});

it("shares one expansion across paired controls and a replacement scene", async () => {
  vi.stubGlobal("matchMedia", () => new DesktopMedia());
  function Changing() {
    const [source, select] = useState("Source 1");
    return (
      <StructureWorkbench
        preview={
          <>
            <Preview key={source} />
            <Preview />
          </>
        }
      >
        <label>
          Source
          <select value={source} onChange={(e) => select(e.target.value)}>
            <option>Source 1</option>
            <option>Source 2</option>
          </select>
        </label>
      </StructureWorkbench>
    );
  }
  const user = userEvent.setup();
  render(<Changing />);
  await user.click(
    screen.getAllByRole("button", { name: "Expand research workspace" })[0],
  );
  const workspace = screen.getByRole("dialog");
  expect(screen.queryByRole("button", { name: "Focus structure" })).toBeNull();
  expect(
    screen.getAllByRole("button", { name: "Close expanded view" }),
  ).toHaveLength(2);
  await user.selectOptions(screen.getByRole("combobox"), "Source 2");
  const selected = screen.getAllByTitle("Native scene")[0];
  expect(screen.getByRole("dialog")).toBe(workspace);
  await user.click(
    screen.getAllByRole("button", { name: "Close expanded view" })[0],
  );
  expect(screen.getAllByTitle("Native scene")[0]).toBe(selected);
  expect(screen.getByRole("combobox")).toHaveValue("Source 2");
  expect(exit).toHaveBeenCalledOnce();
});

it.each(["viewer-panel", "simulation-molecular-viewport"])(
  "expands standalone %s and cleans up when navigation removes it",
  async (surfaceClass) => {
    const user = userEvent.setup();
    const { unmount } = render(<Preview surfaceClass={surfaceClass} />);
    await user.click(
      screen.getByRole("button", { name: "Expand structure view" }),
    );
    expect(screen.getByRole("dialog")).toHaveClass(surfaceClass);
    unmount();
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
    expect(exit).toHaveBeenCalledOnce();
    render(<Workbench />);
    await user.click(openButton());
    expect(closeButton()).toBeVisible();
  },
);

it("recovers cleanly from denied or unavailable popover support without hiding inputs", async () => {
  const user = userEvent.setup();
  enter.mockImplementationOnce(() => {
    throw new Error("Private browser detail");
  });
  const { container } = render(<Workbench />);
  await user.click(openButton());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Expanded view is unavailable",
  );
  expect(screen.queryByText(/Private browser detail/)).toBeNull();
  expect(container.querySelector("[popover]")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(screen.getByRole("combobox")).toBeEnabled();
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    configurable: true,
    value: undefined,
  });
  await user.click(openButton());
  expect(screen.queryByRole("dialog")).toBeNull();
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    configurable: true,
    value: enter,
  });
  await user.click(openButton());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(closeButton()).toBeVisible();
});

it("handles browser-initiated closure and immediate re-entry without remounting", async () => {
  const user = userEvent.setup();
  render(<Workbench />);
  const scene = screen.getByTitle("Native scene");
  await user.click(openButton());
  act(() => nativeClose(screen.getByRole("dialog")));
  expect(openButton()).toBeVisible();
  await user.click(openButton());
  await user.click(closeButton());
  expect(screen.getByTitle("Native scene")).toBe(scene);
  expect(mounts).toHaveBeenCalledOnce();
});

it("releases a retained workspace when its parent becomes hidden and can reopen it", async () => {
  const user = userEvent.setup();
  function Retained({ hidden }: { hidden: boolean }) {
    return (
      <>
        <button>Module navigation</button>
        <div hidden={hidden}>
          <Workbench />
        </div>
      </>
    );
  }
  const { rerender } = render(<Retained hidden={false} />);
  const scene = screen.getByTitle("Native scene");
  await user.click(openButton());
  rerender(<Retained hidden />);
  await waitFor(() => expect(document.body.style.overflow).toBe(""));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Module navigation" }),
  ).toHaveFocus();
  rerender(<Retained hidden={false} />);
  expect(screen.getByTitle("Native scene")).toBe(scene);
  await user.click(openButton());
  expect(closeButton()).toBeVisible();
});

it("collapses before Escape reaches an enclosing review dialog", async () => {
  const user = userEvent.setup();
  const parentKey = vi.fn();
  render(
    <dialog open aria-label="Task review" onKeyDown={parentKey}>
      <Preview />
    </dialog>,
  );
  await user.click(
    screen.getByRole("button", { name: "Expand structure view" }),
  );
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Task review" })).toHaveAttribute(
    "open",
  );
  expect(
    screen.getByRole("button", { name: "Expand structure view" }),
  ).toHaveFocus();
  expect(parentKey).not.toHaveBeenCalled();
});

it("includes a collapsed disclosure at the tab boundary without entering its hidden fields", async () => {
  const user = userEvent.setup();
  render(
    <section className="viewer-panel">
      <WorkspaceFullscreenControl language="en" />
      <button>Before editing</button>
      <details>
        <summary>Selection and display editing</summary>
        <input aria-label="Expert value" />
      </details>
    </section>,
  );
  await user.click(
    screen.getByRole("button", { name: "Expand structure view" }),
  );
  screen.getByRole("button", { name: "Before editing" }).focus();
  await user.keyboard("{Tab}");
  const summary = screen.getByText("Selection and display editing");
  expect(summary).toHaveFocus();
  await user.keyboard("{Tab}");
  expect(closeButton()).toHaveFocus();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(summary).toHaveFocus();
});
