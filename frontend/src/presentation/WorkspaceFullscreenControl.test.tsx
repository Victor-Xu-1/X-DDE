import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StructureWorkbench } from "./StructureWorkbench";
import { WorkspaceFullscreenControl } from "./WorkspaceFullscreenControl";

let fullscreenElement: Element | null;
let enter: ReturnType<typeof vi.fn>;
let exit: ReturnType<typeof vi.fn>;
const mounts = vi.fn();

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
      <WorkspaceFullscreenControl language={language} />
      <div data-testid="native-canvas" />
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
function changed(element: Element | null) {
  fullscreenElement = element;
  document.dispatchEvent(new Event("fullscreenchange"));
}
beforeEach(() => {
  fullscreenElement = null;
  mounts.mockClear();
  enter = vi.fn(function (this: HTMLElement) {
    changed(this);
    return Promise.resolve();
  });
  exit = vi.fn(() => {
    changed(null);
    return Promise.resolve();
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: enter,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exit,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { requestFullscreen?: unknown })
    .requestFullscreen;
  delete (document as { exitFullscreen?: unknown }).exitFullscreen;
  delete (document as { fullscreenElement?: unknown }).fullscreenElement;
});

it.each(["en", "zh"] as const)(
  "expands the whole workspace and keeps the selected pose and native view in %s",
  async (language) => {
    const user = userEvent.setup();
    const { container } = render(<Workbench language={language} />);
    const workspace = container.querySelector(".structure-workbench");
    const canvas = screen.getByTestId("native-canvas");
    await user.selectOptions(screen.getByRole("combobox"), "Pose 2");
    await user.click(
      screen.getByRole("button", {
        name:
          language === "zh"
            ? "全屏研究工作区"
            : "Fullscreen research workspace",
      }),
    );
    expect(enter.mock.instances[0]).toBe(workspace);
    expect(document.fullscreenElement).toBe(workspace);
    expect(screen.getByRole("combobox")).toHaveValue("Pose 2");
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "退出全屏" : "Exit fullscreen",
      }),
    );
    expect(exit).toHaveBeenCalledOnce();
    expect(screen.getByRole("combobox")).toHaveValue("Pose 2");
    expect(screen.getByTestId("native-canvas")).toBe(canvas);
    expect(mounts).toHaveBeenCalledOnce();
  },
);

it("can expand the workspace while its molecular iframe is still loading", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <StructureWorkbench
      preview={
        <section className="viewer-panel">
          <WorkspaceFullscreenControl language="en" />
          <p role="status">Loading native scene</p>
        </section>
      }
    >
      <p>Candidate controls</p>
    </StructureWorkbench>,
  );
  await user.click(
    screen.getByRole("button", { name: "Fullscreen research workspace" }),
  );
  expect(document.fullscreenElement).toBe(
    container.querySelector(".structure-workbench"),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading native scene");
});

it("follows native Escape/external exit events and restores the expand action", async () => {
  const user = userEvent.setup();
  render(<Workbench />);
  await user.click(
    screen.getByRole("button", { name: "Fullscreen research workspace" }),
  );
  act(() => changed(null));
  expect(
    screen.getByRole("button", { name: "Fullscreen research workspace" }),
  ).toHaveAttribute("aria-pressed", "false");
});

it.each(["viewer-panel", "simulation-molecular-viewport"])(
  "keeps a standalone %s usable without a research workspace",
  async (className) => {
    const user = userEvent.setup();
    const { container } = render(<Preview surfaceClass={className} />);
    await user.click(
      screen.getByRole("button", { name: "Fullscreen structure" }),
    );
    expect(document.fullscreenElement).toBe(
      container.querySelector("." + className),
    );
  },
);

it.each(["en", "zh"] as const)(
  "reports a denied native fullscreen request without hiding inputs in %s",
  async (language) => {
    const user = userEvent.setup();
    enter.mockRejectedValueOnce(new Error("Internal browser policy detail"));
    render(<Workbench language={language} />);
    const button = screen.getByRole("button", {
      name:
        language === "zh" ? "全屏研究工作区" : "Fullscreen research workspace",
    });
    await user.click(button);
    expect(screen.getByRole("alert")).toHaveTextContent(
      language === "zh"
        ? "浏览器未允许全屏"
        : "Fullscreen is unavailable in this browser",
    );
    expect(screen.queryByText(/Internal browser policy detail/)).toBeNull();
    expect(screen.getByRole("combobox")).toBeEnabled();
    expect(button).toBeEnabled();
    await user.click(button);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: language === "zh" ? "退出全屏" : "Exit fullscreen",
      }),
    ).toBeVisible();
  },
);

it("handles browsers without the native API without inventing a fullscreen overlay", async () => {
  const user = userEvent.setup();
  delete (HTMLElement.prototype as { requestFullscreen?: unknown })
    .requestFullscreen;
  render(<Workbench />);
  await user.click(
    screen.getByRole("button", { name: "Fullscreen research workspace" }),
  );
  expect(screen.getByRole("alert")).toBeVisible();
  expect(document.fullscreenElement).toBeNull();
  expect(document.body.style.overflow).toBe("");
});

it("bounds repeated clicks while the native request is pending and cleans up its listener", async () => {
  let reject: (error: Error) => void = () => {};
  enter.mockImplementationOnce(
    () =>
      new Promise((_, failure) => {
        reject = failure;
      }),
  );
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const { unmount } = render(<Workbench />);
  const button = screen.getByRole("button", {
    name: "Fullscreen research workspace",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(enter).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  const callback = add.mock.calls.find(
    ([name]) => name === "fullscreenchange",
  )?.[1];
  unmount();
  expect(remove).toHaveBeenCalledWith("fullscreenchange", callback);
  await act(async () => {
    reject(new Error("Late denied request"));
  });
});
