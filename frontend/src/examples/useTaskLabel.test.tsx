import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { Job, Language } from "../types";
import type { TaskHistoryIdentity } from "../studio/task-history-model";
import { useTaskLabel } from "./useTaskLabel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const job = (id = "public", name = "Public native transport-engine") =>
  ({ id, request: { name } }) as Job;
const identity = (
  id: string,
  origin: TaskHistoryIdentity["origin"] = "fixed_example",
  cases: TaskHistoryIdentity["example_cases"] = [
    { id: "stat6", label: ["STAT6 研究", "STAT6 study"] },
  ],
): TaskHistoryIdentity => ({
  job_id: id,
  capability_id: "properties",
  origin,
  example_cases: cases,
});
function Title({
  job,
  language = "zh",
}: {
  job: Job | null;
  language?: Language;
}) {
  return <output>{useTaskLabel(job, language)}</output>;
}

it("does not read an identity before a task is selected", () => {
  const read = vi.spyOn(client, "request");
  render(<Title job={null} />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(read).not.toHaveBeenCalled();
});

it("never flashes an engineering name while verifying a public task", async () => {
  let resolve!: (value: TaskHistoryIdentity) => void;
  const read = vi.spyOn(client, "request").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const original = job();
  const view = render(<Title job={original} />);
  expect(screen.getByRole("status")).toHaveTextContent("研究结果");
  expect(screen.queryByText(original.request.name)).toBeNull();
  await act(async () => resolve(identity(original.id)));
  expect(screen.getByRole("status")).toHaveTextContent("STAT6 研究");
  view.rerender(<Title job={original} language="en" />);
  expect(screen.getByRole("status")).toHaveTextContent("STAT6 study");
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][0]).toBe("/task-history/public/identity");
  expect(original.request.name).toBe("Public native transport-engine");
});

it("preserves a confirmed personal name even when it resembles an engine title", async () => {
  vi.spyOn(client, "request").mockResolvedValue(
    identity("own", "research", []),
  );
  const original = job("own", "BRD4 native assay notes");
  render(<Title job={original} language="en" />);
  expect(await screen.findByText(original.request.name)).toBeVisible();
});

it.each(["fixed_example", "setup_validation"] as const)(
  "uses an explicit historical label for unlinked %s records without guessing a case",
  async (origin) => {
    vi.spyOn(client, "request").mockResolvedValue(
      identity("public", origin, []),
    );
    render(
      <Title
        job={job("public", "STAT6 generated engine title")}
        language="en"
      />,
    );
    expect(
      await screen.findByText("Historical reference result"),
    ).toBeVisible();
    expect(screen.queryByText(/generated engine/)).toBeNull();
  },
);

it("cancels the old lookup and cannot restore its name after selection changes", async () => {
  let oldReply!: (value: TaskHistoryIdentity) => void;
  const read = vi
    .spyOn(client, "request")
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          oldReply = done;
        }),
    )
    .mockResolvedValueOnce(identity("new", "research", []));
  const view = render(<Title job={job("old")} />);
  const signal = (read.mock.calls[0][1] as RequestInit).signal!;
  view.rerender(<Title job={job("new", "New study")} />);
  expect(signal.aborted).toBe(true);
  expect(await screen.findByText("New study")).toBeVisible();
  await act(async () => oldReply(identity("old")));
  expect(screen.getByRole("status")).toHaveTextContent("New study");
  expect(screen.queryByText("STAT6 研究")).toBeNull();
});

it.each(["wrong task", "bad case", "failed lookup"])(
  "keeps unverified titles out of the page for %s",
  async (failure) => {
    const read = vi.spyOn(client, "request");
    if (failure === "failed lookup")
      read.mockRejectedValue(new Error("Unavailable"));
    else
      read.mockResolvedValue(
        failure === "wrong task"
          ? identity("another")
          : {
              ...identity("public"),
              example_cases: [{ id: "bad", label: null }],
            },
      );
    render(<Title job={job()} language="en" />);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(screen.getByRole("status")).toHaveTextContent("Research result");
    expect(screen.queryByText(/transport-engine/)).toBeNull();
  },
);
