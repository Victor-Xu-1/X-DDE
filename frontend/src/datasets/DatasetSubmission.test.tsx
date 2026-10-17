import { StrictMode, useState } from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { WorkflowPlanInput, WorkflowRun } from "../workflows/types";
import { useDELForm } from "./useDELForm";
import type { Job } from "../types";
import type { Asset } from "../operations/types";
import type { DatasetTask } from "./types";
import { BatchDockingForm } from "./BatchDockingForm";
import type { AvailableDataset } from "./types";
import { LibraryForm } from "./LibraryForm";
import { useDatasetRun } from "./useDatasetRun";

const fixture = vi.hoisted(() => ({
  library: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Owned library.csv",
    kind: "library",
    suffix: ".csv",
    size: 40,
    sha256: "a".repeat(64),
    created_at: "2026-10-12T00:00:00Z",
  },
  receptor: {
    asset_id: "22222222-2222-4222-8222-222222222222",
    sha256: "b".repeat(64),
    record: 0,
    conformer: 0,
  },
}));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("./useDatasetExample", () => ({ useDatasetExample: () => null }));
vi.mock("./useTablePreview", () => {
  const preview = {
    columns: ["ID", "SMILES"],
    rows: [],
    format: "csv",
    table: true,
  };
  return {
    useTablePreview: (asset: Asset | null) => ({
      preview: asset ? preview : null,
      error: "",
    }),
  };
});
vi.mock("./DatasetPicker", () => ({
  DatasetPicker: ({ onChange }: { onChange(asset: Asset): void }) => (
    <button type="button" onClick={() => onChange(fixture.library as Asset)}>
      Choose fixture library
    </button>
  ),
}));
vi.mock("./PocketQuestions", () => ({
  usePocketQuestions: () => ({
    receptor: fixture.receptor,
    pocket: {
      kind: "box",
      frame: fixture.receptor,
      box: { center: [0, 0, 0], size: [20, 20, 20], unit: "angstrom" },
    },
    inputs: [{ role: "structure", label: "target", source: fixture.receptor }],
  }),
  ReceptorQuestion: () => <p>Fixture receptor</p>,
  PocketQuestion: () => <p>Fixture pocket</p>,
}));
vi.mock("./SourcePicker", () => ({
  SourcePicker: ({
    onChange,
  }: {
    onChange(value: AvailableDataset[]): void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          {
            job_id: "source-job",
            report_sha256: "d".repeat(64),
            role: "screening",
            name: "Screening fixture",
            counts: {},
            metadata: {},
          },
        ])
      }
    >
      Choose fixture candidates
    </button>
  ),
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <span>Molecule fixture</span>,
}));
vi.mock("./ExecutionView", () => ({
  ExecutionView: ({ execution }: { execution: { id: string } }) => (
    <p>Accepted {execution.id}</p>
  ),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const input = (): DatasetTask =>
  ({
    operation: "library_prepare",
    name: "Owned library",
    inputs: [
      {
        role: "data",
        label: "",
        source: {
          asset_id: fixture.library.id,
          sha256: fixture.library.sha256,
          record: 0,
          conformer: 0,
        },
      },
    ],
    sources: [],
    payload: { kind: "chemistry", mode: "prepare" },
    options: { device: "cpu", cpu: 2, memory_mib: 4096, seed: 101 },
  }) as DatasetTask;
const job = (): Job => ({
  id: "33333333-3333-4333-8333-333333333333",
  request: input(),
  status: "queued",
  created_at: "2026-10-12T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function libraryReview() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Choose fixture library" }),
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  return user;
}

it("leaving the real library form preserves the newer page and URL after acceptance", async () => {
  const receipt = deferred<Job>();
  const send = vi.spyOn(api, "submit").mockReturnValue(receipt.promise);
  const navigated = vi.fn();
  function Host() {
    const [page, setPage] = useState("library");
    return (
      <>
        <button
          onClick={() => {
            window.history.replaceState(null, "", "/#view=research");
            setPage("research");
          }}
        >
          Leave for research
        </button>
        <p data-testid="page">{page}</p>
        {page === "library" && (
          <LibraryForm
            tool="library.import"
            language="en"
            onCreated={(accepted) => {
              navigated(accepted);
              window.history.replaceState(null, "", "/#task=" + accepted.id);
              setPage("task");
            }}
          />
        )}
      </>
    );
  }
  render(<Host />);
  const user = await libraryReview();
  await user.click(screen.getByRole("button", { name: "Submit task" }));
  await user.click(screen.getByRole("button", { name: "Leave for research" }));
  expect(screen.getByTestId("page")).toHaveTextContent("research");
  await act(async () => receipt.resolve(job()));
  expect(send).toHaveBeenCalledTimes(1);
  expect(navigated).not.toHaveBeenCalled();
  expect(window.location.hash).toBe("#view=research");
});

it("accepted job remains a receipt and retry opens only its view after navigation error", async () => {
  const send = vi.spyOn(api, "submit").mockResolvedValue(job());
  const created = vi.fn().mockImplementationOnce(() => {
    throw new Error("Navigation unavailable");
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const view = renderHook(() => useDatasetRun(created));
  let result: unknown;
  await act(async () => {
    result = await view.result.current.submit(input());
  });
  const firstError = view.result.current.error;
  await act(async () => {
    await view.result.current.submit(input());
  });
  expect(result).toEqual({ id: job().id, kind: "job", job: job() });
  expect(firstError).toContain("created");
  expect(send).toHaveBeenCalledTimes(1);
});

it("same-tick calls are synchronously locked", async () => {
  const receipt = deferred<Job>();
  const send = vi.spyOn(api, "submit").mockReturnValue(receipt.promise);
  const view = renderHook(() => useDatasetRun(vi.fn()));
  let a: Promise<unknown>;
  let b: Promise<unknown>;
  act(() => {
    a = view.result.current.submit(input());
    b = view.result.current.submit(input());
  });
  await act(async () => {
    receipt.resolve(job());
    await Promise.all([a, b]);
  });
  expect(send).toHaveBeenCalledTimes(1);
});

it("actual API sends immutable material identity while session initialization waits", async () => {
  const session = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockImplementation((path: string) =>
      path === "/api/session"
        ? session.promise
        : Promise.resolve(new Response(JSON.stringify(job()), { status: 200 })),
    );
  vi.stubGlobal("fetch", fetcher);
  const value = input();
  const view = renderHook(() => useDatasetRun(vi.fn()));
  let pending: Promise<unknown>;
  act(() => {
    pending = view.result.current.submit(value);
  });
  value.inputs[0].source.sha256 = "c".repeat(64);
  await act(async () => {
    session.resolve(
      new Response(JSON.stringify({ csrf_token: "fixture" }), { status: 200 }),
    );
    await pending;
  });
  const sent = JSON.parse(
    fetcher.mock.calls.find(([path]) => path === "/api/jobs")![1].body,
  );
  expect(sent.inputs[0].source.sha256).toBe(fixture.library.sha256);
});

it("keeps the real GuidedSteps duplicate-submit guard and renders an accepted receipt after a view error", async () => {
  const receipt = deferred<Job>();
  const send = vi.spyOn(api, "submit").mockReturnValue(receipt.promise);
  const created = vi.fn(() => {
    throw new Error("Navigation unavailable");
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const view = render(
    <StrictMode>
      <LibraryForm tool="library.import" language="en" onCreated={created} />
    </StrictMode>,
  );
  await libraryReview();
  const form = view.container.querySelector("form")!;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => receipt.resolve(job()));
  expect(created).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Accepted " + job().id)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Task created");
  expect(
    screen.queryByRole("button", { name: "Submit task" }),
  ).not.toBeInTheDocument();
});

it.each(["accepted", "rejected"])(
  "an old %s completion cannot affect a reopened library form (A → B → A)",
  async (outcome) => {
    const receipt = deferred<Job>();
    const send = vi
      .spyOn(api, "submit")
      .mockReturnValueOnce(receipt.promise)
      .mockResolvedValue(job());
    const created = vi.fn();
    const view = render(
      <StrictMode>
        <LibraryForm tool="library.import" language="en" onCreated={created} />
      </StrictMode>,
    );
    const user = await libraryReview();
    await user.click(screen.getByRole("button", { name: "Submit task" }));
    view.rerender(
      <StrictMode>
        <p>Research</p>
      </StrictMode>,
    );
    view.rerender(
      <StrictMode>
        <LibraryForm tool="library.import" language="en" onCreated={created} />
      </StrictMode>,
    );
    await act(async () => {
      if (outcome === "accepted") receipt.resolve(job());
      else receipt.reject(new TypeError("Failed to fetch"));
    });
    expect(created).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "1. Choose materials" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await libraryReview();
    await user.click(screen.getByRole("button", { name: "Submit task" }));
    expect(created).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).not.toBe(send.mock.calls[0][1]);
  },
);

it.each([
  new TypeError("Failed to fetch"),
  new DOMException("timeout", "TimeoutError"),
  new DOMException("aborted", "AbortError"),
])(
  "preserves uncertain job retry keys for %s but rotates changed material",
  async (failure) => {
    const send = vi
      .spyOn(api, "submit")
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(job());
    const created = vi.fn(),
      view = renderHook(() => useDatasetRun(created), { wrapper: StrictMode });
    await act(async () => {
      await view.result.current.submit(input());
    });
    expect(view.result.current.error).toContain("could not be confirmed");
    await act(async () => {
      await view.result.current.submit(input());
    });
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    await act(async () => {
      await view.result.current.submit(input());
    });
    expect(send).toHaveBeenCalledTimes(2);
    const changed = input();
    changed.inputs[0].source.record = 1;
    await act(async () => {
      await view.result.current.submit(changed);
    });
    expect(send.mock.calls[2][1]).not.toBe(send.mock.calls[1][1]);
    expect(send.mock.calls[2][0]).toEqual(changed);
  },
);

it("returns an accepted receipt without navigating after unmount, and ignores stale submit handlers", async () => {
  const receipt = deferred<Job>(),
    created = vi.fn();
  const send = vi.spyOn(api, "submit").mockReturnValue(receipt.promise);
  const view = renderHook(() => useDatasetRun(created));
  let waiting!: Promise<unknown>;
  const submit = view.result.current.submit;
  act(() => {
    waiting = submit(input());
  });
  view.unmount();
  await act(async () => {
    receipt.resolve(job());
    expect(await waiting).toEqual({ id: job().id, kind: "job", job: job() });
  });
  expect(await submit(input())).toBeUndefined();
  expect(created).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
});

const workflow = (): WorkflowPlanInput => ({
  name: "Library workflow",
  steps: [
    {
      id: "prepare",
      request: input(),
      depends_on: [],
      retries: 0,
      bindings: [],
    },
  ],
  budget: { max_jobs: 1, wall_seconds: 300 },
});
const run = (): WorkflowRun => ({
  id: "run-accepted",
  plan_id: "plan",
  state: "running",
  reason: null,
  created_at: "2026-10-12T00:00:00Z",
  attempts: [],
});

it.each(["plan", "run"])(
  "retains exact workflow intent after a lost %s response",
  async (lost) => {
    let fail = true;
    const post = vi
      .spyOn(api, "post")
      .mockImplementation(async (path, body) => {
        if (fail && (lost === "plan") === (path === "/workflows/plans")) {
          fail = false;
          throw new TypeError("Lost response");
        }
        return path === "/workflows/plans"
          ? { id: "plan", sha256: "d".repeat(64), body }
          : run();
      });
    const created = vi.fn(),
      view = renderHook(() => useDatasetRun(created));
    await act(async () => {
      await view.result.current.submit(workflow());
    });
    expect(view.result.current.error).toContain("could not be confirmed");
    await act(async () => {
      expect(await view.result.current.submit(workflow())).toEqual({
        id: run().id,
        kind: "workflow",
        run: run(),
      });
    });
    const plans = post.mock.calls.filter(
      ([path]) => path === "/workflows/plans",
    );
    expect(plans).toHaveLength(2);
    expect(plans[1]).toEqual(plans[0]);
    const runs = post.mock.calls.filter(([path]) => path.endsWith("/runs"));
    if (lost === "run") expect(runs[1]).toEqual(runs[0]);
    const calls = post.mock.calls.length;
    await act(async () => {
      await view.result.current.submit(workflow());
    });
    expect(post).toHaveBeenCalledTimes(calls);
    expect(created).not.toHaveBeenCalled();
    const changed = workflow();
    changed.budget.max_jobs = 2;
    await act(async () => {
      await view.result.current.submit(changed);
    });
    expect(post.mock.calls[calls][2]).not.toBe(plans[0][2]);
    expect(post.mock.calls[calls + 1][2]).not.toBe(runs[0][2]);
  },
);

it("completes an in-flight workflow after unmount without mutating its submitted snapshot", async () => {
  const plan = deferred<unknown>();
  const post = vi
    .spyOn(api, "post")
    .mockReturnValueOnce(plan.promise)
    .mockResolvedValue(run());
  const created = vi.fn(),
    view = renderHook(() => useDatasetRun(created));
  const value = workflow();
  let waiting!: Promise<unknown>;
  act(() => {
    waiting = view.result.current.submit(value);
    void view.result.current.submit(value);
  });
  value.steps[0].request.name = "Changed after submission";
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1]).toEqual(workflow());
  view.unmount();
  await act(async () => {
    plan.resolve({ id: "plan", sha256: "d".repeat(64) });
    expect(await waiting).toEqual({
      id: run().id,
      kind: "workflow",
      run: run(),
    });
  });
  expect(post).toHaveBeenCalledTimes(2);
  expect(created).not.toHaveBeenCalled();
});

it("the direct DEL form consumer retains its accepted receipt after a view error", async () => {
  const send = vi.spyOn(api, "submit").mockResolvedValue(job());
  const created = vi.fn().mockImplementationOnce(() => {
    throw new Error("Navigation unavailable");
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const view = renderHook(() =>
    useDELForm({ tool: "del.library", language: "en", onCreated: created }),
  );
  act(() => view.result.current.setAsset(fixture.library as Asset));
  await act(async () => {
    expect(await view.result.current.submit()).toEqual({
      id: job().id,
      kind: "job",
      job: job(),
    });
  });
  expect(view.result.current.run.error).toContain("Task created");
  await act(async () => {
    await view.result.current.submit();
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(created).toHaveBeenCalledTimes(2);
});

it("the real batch docking form preserves the receipt and selected scientific inputs after a view error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              id: "hit-1",
              artifact: "ligand.sdf",
              source_record: 2,
              rank: 1,
              smiles: "CCO",
              name: "Fixture candidate",
            },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
  const send = vi.spyOn(api, "submit").mockResolvedValue(job());
  const created = vi.fn(() => {
    throw new Error("Navigation unavailable");
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  render(<BatchDockingForm language="en" onCreated={created} />);
  const user = userEvent.setup();
  for (let n = 0; n < 2; n++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Choose fixture candidates" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Submit batch docking" }),
  );
  expect(screen.getByText("Accepted " + job().id)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Task created");
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({
    operation: "screening_dock",
    inputs: [{ role: "structure", source: fixture.receptor }],
    sources: [{ job_id: "source-job", report_sha256: "d".repeat(64) }],
    payload: {
      selected_ids: ["hit-1"],
      receptor: fixture.receptor,
      search: { frame: fixture.receptor },
    },
  });
});
