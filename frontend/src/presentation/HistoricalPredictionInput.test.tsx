import { webcrypto } from "node:crypto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HistoricalPredictionInput } from "./HistoricalPredictionInput";
const download = vi.hoisted(() => vi.fn());
vi.mock("./visual-export", () => ({ downloadBlob: download }));
vi.mock("./MoleculeImage", () => ({
  MoleculeImage: ({ source }: { source: unknown }) => (
    <div data-testid="native-molecule" data-source={JSON.stringify(source)} />
  ),
}));
const id = "8cb693ab-e83f-4170-98b3-016fe59987d5";
const ref = {
  asset_id: id,
  sha256: "d".repeat(64),
  record: 7,
  conformer: 0,
  version_id: null,
};
const submitted = {
  operation: "boltz_predict",
  payload: {
    kind: "boltz",
    components: [
      { id: "A", kind: "protein", value: "ACDEFGHIK" },
      { id: "B", kind: "ligand", value: "", source: ref },
    ],
    samples: 1,
  },
  options: { seed: 101 },
};
const source = (value: unknown, provenance = "recorded-request") =>
  new Response(JSON.stringify(value), {
    headers: { "X-XDDE-Input-Source": provenance },
  });
const modal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const close = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/metadata")
        ? new Response(
            JSON.stringify({ id, sha256: ref.sha256, name: "STAT6-study.sdf" }),
          )
        : source(submitted),
    ),
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const [key, value] of [
    ["showModal", modal],
    ["close", close],
  ] as const) {
    if (value) Object.defineProperty(HTMLDialogElement.prototype, key, value);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
it.each(["en", "zh"] as const)(
  "shows readable %s inputs by default and keeps the original JSON optional",
  async (language) => {
    const zh = language === "zh";
    render(
      <HistoricalPredictionInput
        jobId="job-one"
        label="STAT6 study"
        language={language}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: zh ? "查看输入" : "View input",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: zh ? "概览" : "Overview" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(dialog).toHaveTextContent("9 aa");
    expect(
      within(dialog).getByLabelText(zh ? "输入 JSON" : "Input JSON"),
    ).not.toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByTestId("native-molecule")).toHaveAttribute(
        "data-source",
        JSON.stringify({ url: `/api/assets/${id}?record=7` }),
      ),
    );
    expect(dialog).toHaveTextContent(
      zh ? "文件中的分子条目: 8" : "Molecular record in file: 8",
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: zh ? "原始 JSON" : "Original JSON",
      }),
    );
    expect(
      JSON.parse(
        within(dialog).getByLabelText(zh ? "输入 JSON" : "Input JSON")
          .textContent!,
      ),
    ).toEqual(submitted);
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: zh ? "复制 JSON" : "Copy JSON",
      }),
    );
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(submitted),
      ),
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: zh ? "下载 JSON" : "Download JSON",
      }),
    );
    expect(download.mock.calls[0][1]).toBe("job-one-input.json");
    expect(
      new TextDecoder().decode(await download.mock.calls[0][0].arrayBuffer()),
    ).toBe(JSON.stringify(submitted));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
it("never draws a mismatched source, then recovers its exact original record after retry", async () => {
  let matches = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/metadata")
        ? new Response(
            JSON.stringify({
              id,
              sha256: matches ? ref.sha256 : "a".repeat(64),
            }),
          )
        : source(submitted),
    ),
  );
  render(<HistoricalPredictionInput jobId="job" label="STAT6" language="en" />);
  fireEvent.click(screen.getByRole("button", { name: "View input" }));
  const retry = await screen.findByRole("button", {
    name: "Retry source files",
  });
  expect(screen.queryByTestId("native-molecule")).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Download selected structure input" }),
  ).toBeNull();
  matches = true;
  fireEvent.click(retry);
  expect(await screen.findByTestId("native-molecule")).toHaveAttribute(
    "data-source",
    JSON.stringify({ url: `/api/assets/${id}?record=7` }),
  );
});
it("keeps an unknown format downloadable and does not invent a readable model or entity", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => source({ future_format: "unchanged" })),
  );
  render(<HistoricalPredictionInput jobId="job" label="STAT6" language="en" />);
  fireEvent.click(screen.getByRole("button", { name: "View input" }));
  expect(
    await screen.findByText(/readable overview is unavailable/),
  ).toBeVisible();
  expect(screen.getByLabelText("Input JSON")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Overview" })).toBeNull();
  expect(screen.getByRole("button", { name: "Download JSON" })).toBeEnabled();
});
it("rejects missing provenance and permits a fresh read retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(submitted)),
  );
  render(<HistoricalPredictionInput jobId="job" label="STAT6" language="en" />);
  fireEvent.click(screen.getByRole("button", { name: "View input" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  expect(screen.queryByRole("button", { name: "Download JSON" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  expect(await screen.findByRole("button", { name: "Overview" })).toBeVisible();
});
it("does not reuse the previous job's input or late response when a selected historical job changes", async () => {
  let respond!: (value: Response) => void;
  let oldSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (url.includes("/old/")) {
        oldSignal = options?.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          respond = resolve;
        });
      }
      return Promise.resolve(source({ future_format: "new-job" }));
    }),
  );
  const view = render(
    <HistoricalPredictionInput jobId="old" label="Old" language="en" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "View input" }));
  view.rerender(
    <HistoricalPredictionInput jobId="new" label="New" language="en" />,
  );
  expect(oldSignal?.aborted).toBe(true);
  await screen.findByText(/readable overview is unavailable/);
  respond(source(submitted));
  await waitFor(() =>
    expect(screen.getByLabelText("Input JSON")).toHaveTextContent("new-job"),
  );
  expect(screen.getByRole("dialog")).not.toHaveTextContent("Boltz-2");
});
