import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DELCandidateEvidence } from "./DELCandidateEvidence";
import type { DatasetCandidate, DatasetResult } from "./types";
import * as transport from "../api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const parent = "11111111-1111-4111-8111-111111111111",
  digest = "a".repeat(64);
const candidate = (id = "A048-B082-C024", score = 7.2) =>
  ({ id, score, source_job: parent }) as DatasetCandidate;
const result = {
  metadata: {
    source: { role: "analysis", job_id: parent, report_sha256: digest },
    chosen_comparison: "e2",
  },
} as unknown as DatasetResult;
const summary = () => ({
  job_id: parent,
  report_sha256: digest,
  role: "analysis",
  operation: "del_analyze",
  metadata: { count_unit: "reads" },
});
const row = (member = "A048-B082-C024", score = 7.2) => ({
  member,
  comparison: "e2",
  selection: 36,
  reference: 1,
  score,
  lower: 2.1,
  upper: 121.6,
  replicate_cv: 0.505,
  supporting_samples: 3,
  target_samples: 3,
});

it("shows only the exact encoded member, original count uncertainty and sample support", async () => {
  const call = vi
    .spyOn(transport, "request")
    .mockResolvedValueOnce(summary())
    .mockResolvedValueOnce({ rows: [row("A048-B082-C024-extra"), row()] });
  render(
    <DELCandidateEvidence
      jobId="handoff"
      candidate={candidate()}
      result={result}
      language="en"
    />,
  );
  expect(await screen.findByText("36 / 1")).toBeVisible();
  expect(screen.getByText("3 / 3")).toBeVisible();
  expect(screen.getByText("0.505")).toBeVisible();
  expect(screen.getByText(/Raw reads retain PCR bias/)).toBeVisible();
  expect(
    screen.getByText(/do not establish derived-molecule affinity/),
  ).toBeVisible();
  expect(call.mock.calls[1][0]).toContain("comparison=e2");
  expect(call.mock.calls[1][0]).toContain("search=A048-B082-C024");
});

it("rejects a mismatched parent digest before a count lookup and permits a fresh retry", async () => {
  const call = vi
    .spyOn(transport, "request")
    .mockResolvedValueOnce({ ...summary(), report_sha256: "b".repeat(64) })
    .mockResolvedValueOnce(summary())
    .mockResolvedValueOnce({ rows: [{ ...row(), reference: 0 }] });
  render(
    <DELCandidateEvidence
      jobId="handoff"
      candidate={candidate()}
      result={result}
      language="zh"
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "来源计数暂不可核对",
  );
  expect(call).toHaveBeenCalledTimes(1);
  await userEvent.setup().click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("36 / 0")).toBeVisible();
  expect(screen.getByText(/对照为零表示未观察到/)).toBeVisible();
});

it("does not apply a previous candidate's late response after switching source ownership", async () => {
  let finish!: (value: unknown) => void;
  const call = vi
    .spyOn(transport, "request")
    .mockResolvedValueOnce(summary())
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(summary())
    .mockResolvedValueOnce({ rows: [row("A035-B040-C030", 70.5)] });
  const { rerender, unmount } = render(
    <DELCandidateEvidence
      jobId="handoff"
      candidate={candidate()}
      result={result}
      language="en"
    />,
  );
  await act(async () => {});
  expect(call).toHaveBeenCalledTimes(2);
  const oldSignal = call.mock.calls[1][1]!.signal!;
  rerender(
    <DELCandidateEvidence
      jobId="handoff"
      candidate={candidate("A035-B040-C030", 70.5)}
      result={result}
      language="en"
    />,
  );
  expect(oldSignal.aborted).toBe(true);
  expect(await screen.findByText("36 / 1")).toBeVisible();
  await act(async () => finish({ rows: [{ ...row(), selection: 999 }] }));
  expect(screen.queryByText(/999/)).toBeNull();
  unmount();
  expect(call.mock.calls.at(-1)![1]!.signal!.aborted).toBe(true);
});

it.each([
  { rows: [row("different-member")] },
  { rows: [row(undefined, 1)] },
  { rows: [{ ...row(), supporting_samples: 4 }] },
  { rows: [{ ...row(), lower: -1 }] },
  { rows: [{ ...row(), comparison: "other-comparison" }] },
])(
  "does not substitute inconsistent native count records: %j",
  async (page) => {
    vi.spyOn(transport, "request")
      .mockResolvedValueOnce(summary())
      .mockResolvedValueOnce(page);
    render(
      <DELCandidateEvidence
        jobId="handoff"
        candidate={candidate()}
        result={result}
        language="en"
      />,
    );
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText("36 / 1")).toBeNull();
  },
);

it("retains unassessed legacy support as a dash and avoids a dead retry for missing provenance", async () => {
  const original = row();
  const { supporting_samples: _s, target_samples: _t, ...legacy } = original;
  const call = vi
    .spyOn(transport, "request")
    .mockResolvedValueOnce(summary())
    .mockResolvedValueOnce({ rows: [legacy] });
  const { rerender } = render(
    <DELCandidateEvidence
      jobId="handoff"
      candidate={candidate()}
      result={result}
      language="en"
    />,
  );
  expect(await screen.findByText("—")).toBeVisible();
  rerender(
    <DELCandidateEvidence
      jobId="handoff"
      candidate={candidate()}
      result={{ ...result, metadata: {} }}
      language="en"
    />,
  );
  expect(screen.getByText(/no matching count source/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(call).toHaveBeenCalledTimes(2);
});
