import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DELSeriesContext } from "./DELSeriesContext";
import type { Job } from "../types";
import * as transport from "../api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const job = (id: string) =>
  ({
    id,
    request: {
      operation: "del_series",
      sources: [
        { role: "analysis", job_id: id + "-parent", report_sha256: id },
      ],
    },
  }) as Job;
const summary = (id: string, unit = "reads") => ({
  job_id: id + "-parent",
  report_sha256: id,
  operation: "del_analyze",
  role: "analysis",
  metadata: { count_unit: unit },
});

it("binds raw/PCR scope to the exact parent report and never describes enrichment as affinity", async () => {
  const call = vi.spyOn(transport, "request").mockResolvedValue(summary("a"));
  render(<DELSeriesContext job={job("a")} language="en" />);
  expect(
    await screen.findByText(/raw reads, retaining PCR bias/),
  ).toBeVisible();
  expect(screen.getByText(/all observed members/)).toBeVisible();
  expect(screen.getByText(/do not establish affinity/)).toBeVisible();
  expect(call.mock.calls[0][0]).toBe("/datasets/a-parent/summary");
});

it("rejects a changed digest, exposes retry and distinguishes externally reported counts", async () => {
  const call = vi
    .spyOn(transport, "request")
    .mockResolvedValueOnce(summary("wrong"))
    .mockResolvedValueOnce(summary("a", "reported_counts"));
  render(<DELSeriesContext job={job("a")} language="zh" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "来源说明暂不可核对",
  );
  expect(screen.queryByText(/保留 PCR/)).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "重试" }));
  expect(
    await screen.findByText(/外部报告值，处理方法未独立核实/),
  ).toBeVisible();
  expect(call).toHaveBeenCalledTimes(2);
});

it("does not display a late previous source response after source changes or unmount", async () => {
  let finish!: (value: unknown) => void;
  const call = vi
    .spyOn(transport, "request")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(summary("b", "reported_counts"));
  const { rerender, unmount } = render(
    <DELSeriesContext job={job("a")} language="en" />,
  );
  const signal = call.mock.calls[0][1]!.signal!;
  rerender(<DELSeriesContext job={job("b")} language="en" />);
  expect(signal.aborted).toBe(true);
  expect(await screen.findByText(/externally reported values/)).toBeVisible();
  await act(async () => finish(summary("a")));
  expect(screen.queryByText(/retaining PCR bias/)).toBeNull();
  unmount();
  expect(call.mock.calls[1][1]!.signal!.aborted).toBe(true);
});
