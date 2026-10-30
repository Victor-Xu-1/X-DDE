import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { Job } from "../types";
import type { ScientificTask } from "./types";
import { BinderContinuation } from "./BinderContinuation";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const parent = (id = "stopped-binder") =>
  ({
    id,
    status: "interrupted",
    request: {
      operation: "boltzgen_design",
      name: "STAT6 SH2 native study",
      scientific_inputs: [],
      inputs: [],
      payload: {
        kind: "boltzgen",
        modality: "protein",
        target_chains: ["A"],
        candidates: 20,
        retain: 5,
        length: [70, 90],
      },
      options: { device: "cuda", cpu: 1, memory_mib: 6144, seed: 101 },
    },
  }) as Job;
const summary = (id = "stopped-binder") => ({
  job_id: id,
  sha256: "a".repeat(64),
  counts: {
    generated: 20,
    inverse_folded: 20,
    complex_refolded: 20,
    binder_refolded: 2,
  },
});

it.each(["en", "zh"] as const)(
  "inspects without computation, then explicitly submits one exact continuation in %s",
  async (language) => {
    const job = parent();
    const created = vi.fn();
    const get = vi.spyOn(client, "request").mockResolvedValue(summary());
    let complete!: (job: Job) => void;
    const submit = vi.spyOn(client.api, "submit").mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    render(
      <BinderContinuation
        job={job}
        language={language}
        available
        onCreated={created}
      />,
    );
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name:
          language === "en" ? "Inspect calculated stages" : "检查可接续的计算",
      }),
    );
    expect(
      await screen.findByRole("table", {
        name: language === "en" ? "Calculated stages" : "已计算阶段",
      }),
    ).toHaveTextContent("2 / 20");
    expect(submit).not.toHaveBeenCalled();
    const plan = screen.getByRole("table", {
      name: language === "en" ? "Binder design plan" : "结合体设计方案",
    });
    expect(plan).toHaveTextContent("6144 MiB");
    const button = screen.getByRole("button", {
      name: language === "en" ? "Continue calculated stages" : "接续已计算阶段",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledTimes(1);
    const sent = submit.mock.calls[0][0];
    expect(sent).toEqual({
      ...job.request,
      name: expect.any(String),
      payload: {
        ...(job.request as ScientificTask).payload,
        continuation: { job_id: job.id, sha256: "a".repeat(64) },
      },
    });
    await act(async () =>
      complete({ ...job, id: "new-child", status: "queued" }),
    );
    expect(created).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "new-child" }),
    );
  },
);

it("ignores a delayed previous-task inspection and rejects a changed source identity", async () => {
  let resolve!: (value: unknown) => void;
  const get = vi.spyOn(client, "request").mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(
    <BinderContinuation
      job={parent()}
      language="en"
      available
      onCreated={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect calculated stages" }),
  );
  view.rerender(
    <BinderContinuation
      job={parent("second")}
      language="en"
      available
      onCreated={vi.fn()}
    />,
  );
  await act(async () => resolve(summary()));
  expect(screen.queryByRole("table")).toBeNull();
  get.mockResolvedValue(summary());
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect calculated stages" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be verified",
  );
  expect(
    screen.queryByRole("button", { name: "Continue calculated stages" }),
  ).toBeNull();
});

it("retains the reviewed source on a submission failure and never offers resume for active or completed tasks", async () => {
  vi.spyOn(client, "request").mockResolvedValue(summary());
  vi.spyOn(client.api, "submit").mockRejectedValue(
    new Error("Checkpoint bytes changed"),
  );
  const view = render(
    <BinderContinuation
      job={parent()}
      language="en"
      available
      onCreated={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect calculated stages" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Continue calculated stages" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Checkpoint bytes changed",
  );
  expect(
    screen.getByRole("table", { name: "Calculated stages" }),
  ).toBeVisible();
  for (const status of ["running", "queued", "paused", "succeeded"] as const) {
    view.rerender(
      <BinderContinuation
        job={{ ...parent(), status }}
        language="en"
        available
        onCreated={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  }
});
