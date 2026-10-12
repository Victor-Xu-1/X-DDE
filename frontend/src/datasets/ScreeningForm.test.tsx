import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Asset } from "../operations/types";
import type {
  WorkflowPlan,
  WorkflowPlanInput,
  WorkflowRun,
} from "../workflows/types";
import type { DatasetSource, DatasetTask } from "./types";
import { ScreeningForm } from "./ScreeningForm";

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
    record: 2,
    conformer: 3,
    version_id: "33333333-3333-4333-8333-333333333333",
  },
  index: {
    job_id: "44444444-4444-4444-8444-444444444444",
    report_sha256: "c".repeat(64),
    role: "index",
  },
  reference: {
    asset_id: "88888888-8888-4888-8888-888888888888",
    sha256: "8".repeat(64),
    record: 4,
    conformer: 5,
    version_id: "99999999-9999-4999-8999-999999999999",
  },
  referencePocket: false,
  center: [0, 0, 0],
  preview: { table: true, columns: ["ID", "SMILES", "OtherID", "OtherSMILES"] },
}));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("./useDatasetExample", () => ({ useDatasetExample: () => null }));
vi.mock("./useTablePreview", () => ({
  useTablePreview: () => ({ preview: fixture.preview, error: "" }),
}));
vi.mock("./DatasetPicker", () => ({
  DatasetPicker: ({ onChange }: { onChange(asset: Asset): void }) => (
    <button
      type="button"
      onClick={() => onChange({ ...fixture.library } as Asset)}
    >
      Choose fixture library
    </button>
  ),
}));
vi.mock("./SourcePicker", () => ({
  SourcePicker: ({
    onChange,
  }: {
    onChange(sources: DatasetSource[]): void;
  }) => (
    <button
      type="button"
      onClick={() => onChange([{ ...fixture.index } as DatasetSource])}
    >
      Choose fixture index
    </button>
  ),
}));
vi.mock("./SupplierPicker", () => ({
  SupplierPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange(value: string): void;
  }) => (
    <label>
      Compound source
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="custom">Owned</option>
        <option value="chemdiv">ChemDiv</option>
      </select>
    </label>
  ),
}));
vi.mock("./PocketQuestions", () => ({
  usePocketQuestions: () => ({
    receptor: { ...fixture.receptor },
    pocket: fixture.referencePocket
      ? {
          kind: "reference_ligand",
          frame: { ...fixture.receptor },
          reference: { ...fixture.reference },
          coordinate_basis: "user_confirmed",
        }
      : {
          kind: "box",
          frame: { ...fixture.receptor },
          box: {
            center: [...fixture.center],
            size: [20, 20, 20],
            unit: "angstrom",
          },
        },
    inputs: [
      { role: "structure", source: { ...fixture.receptor } },
      ...(fixture.referencePocket
        ? [{ role: "ligand", source: { ...fixture.reference } }]
        : []),
    ],
  }),
  ReceptorQuestion: () => <p>Fixture receptor</p>,
  PocketQuestion: () => <p>Fixture pocket</p>,
}));
vi.mock("./ExecutionView", () => ({
  ExecutionView: ({
    execution,
  }: {
    execution: { id: string; kind: string };
  }) => (
    <p>
      Accepted {execution.kind} {execution.id}
    </p>
  ),
}));
const original = structuredClone(fixture);
beforeEach(() => Object.assign(fixture, structuredClone(original)));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Call = { path: string; body: unknown; key: string };
function transport(lose: "plan" | "run" = "run", alwaysLose = false) {
  const calls: Call[] = [],
    plans = new Map<string, WorkflowPlan>(),
    runs = new Map<string, WorkflowRun>();
  let losses = 0;
  // A software-only keyed server boundary: acceptance persists before the response is lost.
  vi.spyOn(api, "post").mockImplementation(async (path, body, key) => {
    if (!key) throw new Error("Missing idempotency key");
    calls.push({ path, body: structuredClone(body), key });
    if (path === "/workflows/plans") {
      const saved = plans.get(key);
      if (saved) expect(body).toEqual(saved.body);
      const plan = saved ?? {
        id: "plan-" + (plans.size + 1),
        sha256: "d".repeat(64),
        body: structuredClone(body) as WorkflowPlanInput,
        created_at: "2026-10-12T00:00:00Z",
      };
      plans.set(key, plan);
      if (lose === "plan" && (alwaysLose || losses++ === 0))
        throw new TypeError("Plan accepted, response lost");
      return plan;
    }
    const plan = [...plans.values()].find(
      (value) => path === `/workflows/plans/${value.id}/runs`,
    );
    if (!plan) throw new Error("Unexpected workflow request");
    expect(body).toEqual({ plan_sha256: plan.sha256 });
    const saved = runs.get(key);
    if (saved) expect(saved.plan_id).toBe(plan.id);
    const run = saved ?? {
      id: "run-" + (runs.size + 1),
      plan_id: plan.id,
      state: "running",
      reason: null,
      created_at: "2026-10-12T00:00:00Z",
      attempts: [],
    };
    runs.set(key, run);
    if (lose === "run" && (alwaysLose || losses++ === 0))
      throw new TypeError("Run accepted, response lost");
    return run;
  });
  return {
    calls,
    plans,
    runs,
    planCalls: () => calls.filter((call) => call.path === "/workflows/plans"),
    runCalls: () => calls.filter((call) => call.path.endsWith("/runs")),
  };
}
async function review(historical = false, dock = false) {
  const user = userEvent.setup();
  for (let i = 0; i < 2; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  if (historical)
    await user.click(
      screen.getByRole("radio", { name: /Historical screening indexes/ }),
    );
  await user.click(
    screen.getByRole("button", {
      name: historical ? "Choose fixture index" : "Choose fixture library",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  if (dock)
    await user.click(screen.getByRole("radio", { name: /Screen and dock/ }));
  return user;
}
async function loseResponse(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Submit screening" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Task submission could not be confirmed. Submit again to continue the same request.",
  );
}

it.each([
  [false, false, "run"],
  [false, true, "run"],
  [true, false, "run"],
  [true, true, "run"],
  [false, false, "plan"],
  [true, true, "plan"],
] as const)(
  "reuses an unchanged screening intent (historical=%s, dock=%s, lost=%s)",
  async (historical, dock, lost) => {
    const server = transport(lost),
      created = vi.fn();
    const view = render(<ScreeningForm language="en" onCreated={created} />);
    const user = await review(historical, dock);
    await loseResponse(user);
    view.rerender(<ScreeningForm language="en" onCreated={created} />);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Submit screening" }));
    expect(await screen.findByText("Accepted workflow run-1")).toBeVisible();
    expect(server.planCalls()[1]).toEqual(server.planCalls()[0]);
    if (lost === "run")
      expect(server.runCalls()[1]).toEqual(server.runCalls()[0]);
    expect(server.plans.size).toBe(1);
    expect(server.runs.size).toBe(1);
    expect(created).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Step 5: View results" }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.queryByRole("button", { name: "Submit screening" }),
    ).not.toBeInTheDocument();
    const steps = server.planCalls()[0].body as WorkflowPlanInput;
    const screenStep = steps.steps.find((step) => step.id === "screen")!
      .request as DatasetTask;
    expect(screenStep.inputs[0].source).toEqual(fixture.receptor);
    expect(screenStep.payload.search).toMatchObject({
      frame: fixture.receptor,
    });
    if (historical) expect(screenStep.sources).toEqual([fixture.index]);
    else
      expect(steps.steps[0].request).toMatchObject({
        inputs: [
          {
            source: {
              asset_id: fixture.library.id,
              sha256: fixture.library.sha256,
              record: 0,
              conformer: 0,
            },
          },
        ],
      });
  },
);

it.each([
  ["Task name (optional)", "Revised screening"],
  ["Retrieval scoring", "mean_cosine"],
  ["Alternate protein conformers", "reject"],
  ["Compute device", "cuda"],
  ["Pocket radius (Å)", "8"],
  ["Maximum molecules per batch", "64"],
  ["Property range", "lead_like"],
  ["PAINS / Brenk rules", "exclude"],
  ["Compound source", "chemdiv"],
  ["Supplier or compound ID", "OtherID"],
  ["SMILES column", "OtherSMILES"],
])(
  "creates a new intent when %s changes, then keeps that retry stable",
  async (label, value) => {
    const server = transport("run", true);
    render(<ScreeningForm language="en" onCreated={vi.fn()} />);
    const user = await review();
    await loseResponse(user);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await loseResponse(user);
    await loseResponse(user);
    expect(server.planCalls()[1].key).not.toBe(server.planCalls()[0].key);
    expect(server.runCalls()[1].key).not.toBe(server.runCalls()[0].key);
    expect(server.planCalls()[2]).toEqual(server.planCalls()[1]);
    expect(server.runCalls()[2]).toEqual(server.runCalls()[1]);
  },
);

it.each(["asset_id", "sha256", "record", "conformer", "version_id", "pocket"])(
  "keeps exact changed receptor %s in a new intent",
  async (field) => {
    const server = transport("run", true),
      created = vi.fn();
    const view = render(<ScreeningForm language="en" onCreated={created} />);
    const user = await review();
    await loseResponse(user);
    if (field === "pocket") fixture.center = [1, 2, 3];
    else if (field === "record" || field === "conformer")
      fixture.receptor[field] += 1;
    else if (field === "sha256") fixture.receptor.sha256 = "e".repeat(64);
    else
      fixture.receptor[field as "asset_id" | "version_id"] =
        "55555555-5555-4555-8555-555555555555";
    view.rerender(<ScreeningForm language="en" onCreated={created} />);
    await loseResponse(user);
    expect(server.planCalls()[1].key).not.toBe(server.planCalls()[0].key);
    expect(server.runCalls()[1].key).not.toBe(server.runCalls()[0].key);
    const step = (server.planCalls()[1].body as WorkflowPlanInput).steps.find(
      (value) => value.id === "screen",
    )!.request as DatasetTask;
    expect(step.inputs[0].source).toEqual(fixture.receptor);
    expect(step.payload.search).toMatchObject({
      frame: fixture.receptor,
      box: { center: fixture.center },
    });
  },
);

it("uses a fresh intent for an edited then resubmitted original plan and a separate form", async () => {
  const server = transport("run", true);
  const view = render(<ScreeningForm language="en" onCreated={vi.fn()} />);
  const user = await review();
  await loseResponse(user);
  fireEvent.change(screen.getByLabelText("Task name (optional)"), {
    target: { value: "Second intent" },
  });
  await loseResponse(user);
  fireEvent.change(screen.getByLabelText("Task name (optional)"), {
    target: { value: "" },
  });
  await loseResponse(user);
  expect(server.planCalls()[2].body).toEqual(server.planCalls()[0].body);
  expect(new Set(server.planCalls().map((call) => call.key)).size).toBe(3);
  expect(new Set(server.runCalls().map((call) => call.key)).size).toBe(3);
  view.unmount();
  render(<ScreeningForm language="en" onCreated={vi.fn()} />);
  await review();
  await loseResponse(user);
  expect(new Set(server.planCalls().map((call) => call.key)).size).toBe(4);
  expect(new Set(server.runCalls().map((call) => call.key)).size).toBe(4);
});

it.each([
  "Screen and dock",
  "Broader exploration",
  "Structural diversity",
  "One per scaffold",
])("rotates intent for the %s choice", async (choice) => {
  const server = transport("run", true);
  render(<ScreeningForm language="en" onCreated={vi.fn()} />);
  const user = await review();
  await loseResponse(user);
  await user.click(screen.getByRole("radio", { name: new RegExp(choice) }));
  await loseResponse(user);
  expect(server.planCalls()[1].key).not.toBe(server.planCalls()[0].key);
  expect(server.runCalls()[1].key).not.toBe(server.runCalls()[0].key);
  expect(server.planCalls()[1].body).not.toEqual(server.planCalls()[0].body);
});

it.each(["library ID", "library digest", "source job", "source report"])(
  "retains the changed %s without reusing the previous request",
  async (identity) => {
    const historical = identity.startsWith("source"),
      server = transport("run", true);
    render(<ScreeningForm language="en" onCreated={vi.fn()} />);
    const user = await review(historical, historical);
    await loseResponse(user);
    if (identity === "library ID")
      fixture.library.id = "66666666-6666-4666-8666-666666666666";
    if (identity === "library digest") fixture.library.sha256 = "f".repeat(64);
    if (identity === "source job")
      fixture.index.job_id = "77777777-7777-4777-8777-777777777777";
    if (identity === "source report")
      fixture.index.report_sha256 = "e".repeat(64);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(
      screen.getByRole("button", {
        name: historical ? "Choose fixture index" : "Choose fixture library",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await loseResponse(user);
    expect(server.planCalls()[1].key).not.toBe(server.planCalls()[0].key);
    expect(server.runCalls()[1].key).not.toBe(server.runCalls()[0].key);
    const plan = server.planCalls()[1].body as WorkflowPlanInput;
    if (historical)
      expect(plan.steps[0].request).toMatchObject({ sources: [fixture.index] });
    else
      expect(plan.steps[0].request).toMatchObject({
        inputs: [
          {
            source: {
              asset_id: fixture.library.id,
              sha256: fixture.library.sha256,
            },
          },
        ],
      });
  },
);

it("ignores picker display metadata changes when all submitted material is unchanged", async () => {
  const server = transport("run", true);
  render(<ScreeningForm language="en" onCreated={vi.fn()} />);
  const user = await review();
  await loseResponse(user);
  fixture.library.created_at = "2026-10-12T01:00:00Z";
  fixture.library.size += 10;
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(
    screen.getByRole("button", { name: "Choose fixture library" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await loseResponse(user);
  expect(server.planCalls()[1]).toEqual(server.planCalls()[0]);
  expect(server.runCalls()[1]).toEqual(server.runCalls()[0]);
});

it.each(["asset_id", "sha256", "record", "conformer", "version_id"])(
  "keeps changed reference-ligand %s in the new request",
  async (field) => {
    fixture.referencePocket = true;
    const server = transport("run", true),
      created = vi.fn();
    const view = render(<ScreeningForm language="en" onCreated={created} />);
    const user = await review();
    await loseResponse(user);
    if (field === "record" || field === "conformer")
      fixture.reference[field] += 1;
    else if (field === "sha256") fixture.reference.sha256 = "9".repeat(64);
    else
      fixture.reference[field as "asset_id" | "version_id"] =
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    view.rerender(<ScreeningForm language="en" onCreated={created} />);
    await loseResponse(user);
    expect(server.planCalls()[1].key).not.toBe(server.planCalls()[0].key);
    expect(server.runCalls()[1].key).not.toBe(server.runCalls()[0].key);
    const step = (server.planCalls()[1].body as WorkflowPlanInput).steps.find(
      (value) => value.id === "screen",
    )!.request as DatasetTask;
    expect(step.inputs[1].source).toEqual(fixture.reference);
    expect(step.payload.search).toMatchObject({
      frame: fixture.receptor,
      reference: fixture.reference,
      coordinate_basis: "user_confirmed",
    });
  },
);
