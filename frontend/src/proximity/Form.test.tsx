import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ProximityForm } from "./Form";
import { defaults } from "./generated";
import type { ScientificTask } from "../integrations/types";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  example: null as { options: ScientificTask["options"] } | null,
}));
vi.mock("../examples/context", async () => ({
  ...(await vi.importActual<typeof import("../examples/context")>(
    "../examples/context",
  )),
  useExampleTask: () => mocks.example,
}));
vi.mock("../operations/useTaskSubmit", () => ({
  useTaskSubmit: () => ({ busy: false, error: "", submit: mocks.submit }),
}));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("./InitialMaterials", () => ({
  InitialMaterials: () => <p>Confirmed complete molecule</p>,
}));
vi.mock("./PartnerQuestion", () => ({
  PartnerQuestion: () => <p>Confirmed binary pose</p>,
}));
vi.mock("./useProximityDraft", () => ({
  useProximityDraft: () => ({
    ligand: {
      asset_id: "full",
      sha256: "a".repeat(64),
      record: 0,
      conformer: 0,
    },
    first: {
      asset_id: "first",
      sha256: "b".repeat(64),
      record: 0,
      conformer: 0,
    },
    second: {
      asset_id: "second",
      sha256: "c".repeat(64),
      record: 0,
      conformer: 0,
    },
    armA: {
      asset_id: "arm-a",
      sha256: "d".repeat(64),
      record: 0,
      conformer: 0,
    },
    armB: {
      asset_id: "arm-b",
      sha256: "e".repeat(64),
      record: 0,
      conformer: 0,
    },
    binary: true,
    firstReady: true,
    secondReady: true,
    planReady: true,
    payload: {
      ...defaults,
      partner_a_name: "Recruiter",
      partner_b_name: "Target",
    },
    setPayload: vi.fn(),
    onLigand: vi.fn(),
  }),
}));
afterEach(() => {
  cleanup();
  mocks.example = null;
  vi.clearAllMocks();
});
async function review(language: "en" | "zh" = "en") {
  const user = userEvent.setup();
  render(<ProximityForm language={language} onCreated={vi.fn()} />);
  for (let step = 0; step < 3; step++)
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "下一步" : "Next",
      }),
    );
  return user;
}
it("submits the visible4GiB default through the real questionnaire and retains all five inputs", async () => {
  const user = await review();
  expect(screen.getByText("2 CPU · 4 GiB")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Start ternary modeling" }),
  );
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  const request = mocks.submit.mock.calls[0][0] as ScientificTask;
  expect(request.options).toEqual({
    device: "cpu",
    cpu: 2,
    memory_mib: 4096,
    seed: 31,
  });
  expect(request.inputs.map((i) => i.role)).toEqual([
    "ligand",
    "partner_a",
    "partner_b",
    "arm_a",
    "arm_b",
  ]);
  expect(request.scientific_inputs).toEqual(
    request.inputs.map((i) => i.source),
  );
  expect(request.payload.ligand_correction).toBe(true);
});
it("submits selected CPU/memory/seed values and keeps them when returning to the previous step", async () => {
  const user = await review();
  await user.click(screen.getByText("Expert settings"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "CPU threads" }),
    "1",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Memory limit (GiB)" }),
    "8192",
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "Random seed" }), {
    target: { value: "53" },
  });
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("1 CPU · 8 GiB")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Start ternary modeling" }),
  );
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  expect(mocks.submit.mock.calls[0][0].options).toEqual({
    device: "cpu",
    cpu: 1,
    memory_mib: 8192,
    seed: 53,
  });
});
it("blocks an invalid seed in the Chinese form and recovers without losing the selected budget", async () => {
  const user = await review("zh");
  await user.click(screen.getByText("专家微调"));
  fireEvent.change(screen.getByRole("spinbutton", { name: "随机种子" }), {
    target: { value: "-1" },
  });
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "开始三元建模" })).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("spinbutton", { name: "随机种子" }), {
    target: { value: "31" },
  });
  expect(screen.getByRole("button", { name: "开始三元建模" })).toBeEnabled();
  expect(screen.getByText("2 CPU · 4 GiB")).toBeVisible();
});
it("preserves archived example resources rather than silently changing their reproduction", async () => {
  mocks.example = {
    options: { device: "cpu", cpu: 3, memory_mib: 6144, seed: 909 },
  };
  const user = await review();
  expect(screen.getByText("3 CPU · 6 GiB")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Start ternary modeling" }),
  );
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  expect(mocks.submit.mock.calls[0][0].options).toEqual(mocks.example.options);
});
