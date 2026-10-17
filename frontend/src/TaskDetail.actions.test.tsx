import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { api } from "./api";
import { TaskDetail } from "./TaskDetail";
import type { Job } from "./types";
import { defaults } from "./form-model";

// Label-source reads have their own tests; keep these action races deterministic.
vi.mock("./examples/useTaskLabel", () => ({
  useTaskLabel: (job: Job | null) => job?.request.name ?? "",
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const source = (id = "parent-a"): Job => ({
  id,
  request: {
    name: id === "parent-b" ? "Destination study" : "Origin study",
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
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    "The task was updated",
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

it.each([
  ["other task", "resolved"],
  ["other task", "rejected"],
  ["leave results", "resolved"],
  ["leave results", "rejected"],
] as const)(
  "does not reclaim navigation after keyed detail unmounts for %s and retry is %s",
  async (destination, outcome) => {
    let resolve!: (job: Job) => void, reject!: (error: Error) => void;
    const retry = vi.spyOn(api, "retry").mockImplementation(
      () =>
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
    );
    const changed = vi.fn();
    const detail = (id: string) => (
      <TaskDetail
        key={id}
        job={source(id)}
        detail={null}
        failed={false}
        language="en"
        onChange={changed}
      />
    );
    const view = render(<StrictMode>{detail("parent-a")}</StrictMode>);
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(
      <StrictMode>
        {destination === "other task" ? detail("parent-b") : <h1>New task</h1>}
      </StrictMode>,
    );
    await act(async () => {
      if (outcome === "resolved") resolve(child());
      else reject(new Error("Old retry response failed"));
    });
    expect(changed).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    if (destination === "other task")
      expect(
        screen.getByRole("heading", { name: "Destination study" }),
      ).toBeVisible();
    else
      expect(screen.getByRole("heading", { name: "New task" })).toBeVisible();
  },
);

it("invalidates an earlier retry when a retained detail changes A to B to A", async () => {
  let resolve!: (job: Job) => void;
  const retry = vi.spyOn(api, "retry").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const changed = vi.fn();
  const detail = (id: string) => (
    <TaskDetail
      job={source(id)}
      detail={null}
      failed={false}
      language="en"
      onChange={changed}
    />
  );
  const view = render(detail("parent-a"));
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  view.rerender(detail("parent-b"));
  view.rerender(detail("parent-a"));
  await act(async () => resolve(child()));
  expect(changed).not.toHaveBeenCalled();
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
});

it("does not reclaim a newer task after the old cancellation finishes", async () => {
  let resolve!: (job: Job) => void;
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const cancel = vi.spyOn(api, "cancel").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const changed = vi.fn();
  const view = render(
    <TaskDetail
      key="parent-a"
      job={{ ...source(), status: "queued" }}
      detail={null}
      failed={false}
      language="en"
      onChange={changed}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel task" }));
  view.rerender(
    <TaskDetail
      key="parent-b"
      job={source("parent-b")}
      detail={null}
      failed={false}
      language="en"
      onChange={changed}
    />,
  );
  await act(async () => resolve(source()));
  expect(changed).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("heading", { name: "Destination study" }),
  ).toBeVisible();
});

it("opens a still-current confirmed retry in StrictMode", async () => {
  const retry = vi.spyOn(api, "retry").mockResolvedValue(child());
  const changed = vi.fn();
  render(
    <StrictMode>
      <TaskDetail
        job={source()}
        detail={null}
        failed={false}
        language="en"
        onChange={changed}
      />
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(child()));
  expect(retry).toHaveBeenCalledTimes(1);
});

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
