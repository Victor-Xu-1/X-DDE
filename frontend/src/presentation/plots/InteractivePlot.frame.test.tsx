import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InteractivePlot } from "./InteractivePlot";

const native = vi.hoisted(() => {
  const pending: {
    target: HTMLElement;
    resolve(): void;
    reject(error: Error): void;
  }[] = [];
  return {
    pending,
    react: vi.fn((target, data) => {
      target.data = data;
      target.removeAllListeners = vi.fn();
      target.on = vi.fn();
      return new Promise<void>((resolve, reject) =>
        pending.push({ target, resolve, reject }),
      );
    }),
    purge: vi.fn(),
    relayout: vi.fn(async () => {}),
    Plots: { resize: vi.fn() },
  };
});
vi.mock("plotly.js-cartesian-dist-min", () => ({ default: native }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  native.pending.length = 0;
  native.react.mockClear();
});

function scene(
  sourceKey?: string,
  value = 1,
  selected = false,
  language = "en",
) {
  return {
    sourceKey,
    title: "PAE",
    data: [{ type: "heatmap" as const, x: [value], y: [value], z: [[value]] }],
    layout: {
      shapes: selected ? [{ type: "rect" as const, x0: 0, x1: 1 }] : [],
    },
    language: language as "en" | "zh",
  };
}
function installObserver() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
}
async function started(index: number) {
  await waitFor(() => expect(native.pending.length).toBeGreaterThan(index));
}
async function finish(index: number) {
  await started(index);
  await act(async () => native.pending[index].resolve());
}
async function ready(language = "en") {
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: language === "zh" ? "重置" : "Reset",
      }),
    ).toBeEnabled(),
  );
}

it.each(["en", "zh"])(
  "keeps a verified same-source view while selection updates (%s)",
  async (language) => {
    installObserver();
    const initial = scene("native-A", 1, false, language);
    const view = render(<InteractivePlot {...initial} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      language === "zh" ? "正在加载" : "Loading",
    );
    await finish(0);
    await ready(language);
    const canvas = screen.getByRole("application");
    view.rerender(
      <InteractivePlot {...scene("native-A", 1, true, language)} />,
    );
    await started(1);
    expect(canvas).toHaveAttribute("aria-busy", "true");
    expect(canvas).toHaveAttribute("data-frame-current", "true");
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: language === "zh" ? "重置" : "Reset",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Export figure|文献图导出/ }),
    ).toBeDisabled();
    await finish(1);
    await ready(language);
    expect(canvas).toHaveAttribute("aria-busy", "false");
    expect(JSON.stringify(initial.data)).toContain('"z":[[1]]');
  },
);

it("keeps default consumers conservative on layout refresh", async () => {
  installObserver();
  const view = render(<InteractivePlot {...scene()} />);
  await finish(0);
  await ready();
  view.rerender(<InteractivePlot {...scene(undefined, 1, true)} />);
  await started(1);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "false",
  );
  await finish(1);
  await ready();
});

it("invalidates a changed source even when all plotted values happen to match", async () => {
  installObserver();
  const view = render(<InteractivePlot {...scene("native-A")} />);
  await finish(0);
  await ready();
  view.rerender(<InteractivePlot {...scene("native-B")} />);
  await started(1);
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "false",
  );
  expect(screen.getByRole("button", { name: /Export figure/ })).toBeDisabled();
  await finish(1);
  await ready();
});

it("does not retain a frame when native values change under the same source key", async () => {
  installObserver();
  const view = render(<InteractivePlot {...scene("native-A")} />);
  await finish(0);
  await ready();
  view.rerender(<InteractivePlot {...scene("native-A", 2)} />);
  await started(1);
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "false",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  await finish(1);
  await ready();
});

it("does not revive the old A readiness while B is rendering and A is queued again", async () => {
  installObserver();
  const original = scene("native-A");
  const view = render(<InteractivePlot {...original} />);
  await finish(0);
  await ready();
  view.rerender(<InteractivePlot {...scene("native-B", 2)} />);
  await started(1);
  view.rerender(<InteractivePlot {...original} />);
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Export figure/ })).toBeDisabled();
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "false",
  );
  await finish(1);
  await started(2);
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "false",
  );
  await finish(2);
  await ready();
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "true",
  );
});

it("revokes a failed frame and recovers only after a successful native redraw", async () => {
  installObserver();
  const view = render(<InteractivePlot {...scene("native-A")} />);
  await finish(0);
  await ready();
  view.rerender(<InteractivePlot {...scene("native-A", 1, true)} />);
  await started(1);
  await act(async () =>
    native.pending[1].reject(new Error("Native redraw failed")),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("could not load");
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "false",
  );
  expect(screen.getByRole("button", { name: /Export figure/ })).toBeDisabled();
  view.rerender(<InteractivePlot {...scene("native-A")} />);
  await started(2);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("application")).toHaveAttribute(
    "data-frame-current",
    "false",
  );
  await finish(2);
  await ready();
});
