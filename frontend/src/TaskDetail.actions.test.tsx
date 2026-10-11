import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { TaskDetail } from "./TaskDetail";
import type { Job } from "./types";
import { defaults } from "./form-model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const source = (id = "parent-a"): Job => ({
  id,
  request: {
    name: "Lifecycle " + id,
    components: [{ kind: "protein", value: "MSLWGLVSKMPPEK", count: 1 }],
    parameters: defaults,
  },
  status: "cancelled",
  created_at: "2026-10-11T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
});
const child = (): Job => ({
  ...source("child-a"),
  parent_id: "parent-a",
  status: "queued",
});

it("retains a retry key until the confirmed child is delivered to the task view", async () => {
  const retry = vi.spyOn(api, "retry").mockResolvedValue(child());
  const changed = vi.fn().mockImplementationOnce(() => {
    throw new Error("Result view unavailable");
  });
  render(
    <TaskDetail
      job={source()}
      detail={null}
      failed={false}
      language="en"
      onChange={changed}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Result view unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  expect(retry.mock.calls[0]).toEqual(retry.mock.calls[1]);
});

it.each(["resolved", "rejected"])(
  "does not change a newer selection after an older action %s",
  async (outcome) => {
    let resolve!: (job: Job) => void, reject!: (error: Error) => void;
    vi.spyOn(api, "retry").mockImplementation(
      () =>
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
    );
    const changed = vi.fn();
    const view = render(
      <TaskDetail
        job={source()}
        detail={null}
        failed={false}
        language="en"
        onChange={changed}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    view.rerender(
      <TaskDetail
        job={source("parent-b")}
        detail={null}
        failed={false}
        language="en"
        onChange={changed}
      />,
    );
    await act(async () => {
      if (outcome === "resolved") resolve(child());
      else reject(new Error("Old request failed"));
    });
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
  },
);

it("honors a dismissed cancellation confirmation", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const cancel = vi.spyOn(api, "cancel");
  render(
    <TaskDetail
      job={{ ...source(), status: "queued" }}
      detail={null}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel task" }));
  expect(cancel).not.toHaveBeenCalled();
});

it("keeps an action failure attached to its source task when selection changes", async () => {
  vi.spyOn(api, "retry").mockRejectedValue(
    new Error("Retry of parent A failed"),
  );
  const view = render(
    <TaskDetail
      job={source()}
      detail={null}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Retry of parent A failed",
  );
  view.rerender(
    <TaskDetail
      job={source("parent-b")}
      detail={null}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(screen.queryByRole("alert")).toBeNull();
});

it("allows another task's action while an earlier selected task is still pending", async () => {
  let resolve!: (job: Job) => void;
  const childB = {
    ...source("child-b"),
    status: "queued" as const,
    parent_id: "parent-b",
  };
  vi.spyOn(api, "retry").mockImplementation((id) =>
    id === "parent-a"
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(childB),
  );
  const changed = vi.fn();
  const view = render(
    <TaskDetail
      job={source()}
      detail={null}
      failed={false}
      language="en"
      onChange={changed}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  view.rerender(
    <TaskDetail
      job={source("parent-b")}
      detail={null}
      failed={false}
      language="en"
      onChange={changed}
    />,
  );
  expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(childB));
  await act(async () => {
    resolve(child());
  });
  expect(changed).toHaveBeenCalledTimes(1);
});
