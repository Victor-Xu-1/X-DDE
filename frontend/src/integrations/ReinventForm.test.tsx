import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { ScientificForm } from "./ScientificForm";

const scaffold = "CN(C)C(=O)c1cc2ccc([*:1])c(F)c2[nH]1";
const historical = {
  asset_id: "historical-molecule",
  sha256: "a".repeat(64),
  record: 3,
  conformer: 0,
};
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../examples/context", async (original) => ({
  ...(await original<typeof import("../examples/context")>()),
  useExample: () => null,
  useExampleReference: () => historical,
  useExampleTask: () => ({
    name: "Fixed-port study",
    inputs: [],
    payload: { mode: "r_groups", fragments: [scaffold], candidates: 20 },
    options: { device: "cpu", cpu: 2, memory_mib: 2048, seed: 2026 },
  }),
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ source, label }: { source: unknown; label: string }) => (
    <div role="img" aria-label={label} data-source={JSON.stringify(source)} />
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("submits the loaded template's resource budget and seed without expert edits", async () => {
  const submit = vi
    .spyOn(api, "submit")
    .mockResolvedValue({ id: "template-study" } as never);
  render(
    <ScientificForm form="reinvent.design" language="en" onCreated={vi.fn()} />,
  );
  const user = userEvent.setup();
  const next = () => screen.getByRole("button", { name: "Next" });
  await user.click(next());
  await user.click(next());
  expect(screen.getByRole("radio", { name: "20 candidates" })).toBeChecked();
  await user.click(next());
  const review = screen.getByRole("table", { name: "Design plan review" });
  expect(
    within(review).getByText("CPU · 2 cores · 2048 MiB", { exact: true }),
  ).toBeVisible();
  expect(within(review).getByText("2026", { exact: true })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Submit calculation" }));
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][0]).toMatchObject({
    options: { device: "cpu", cpu: 2, memory_mib: 2048, seed: 2026 },
    payload: { mode: "r_groups", fragments: [scaffold], candidates: 20 },
  });
});

it("submits only the reviewed R-group scope after editing the count, resources and seed", async () => {
  const submit = vi
    .spyOn(api, "submit")
    .mockResolvedValue({ id: "accepted-design", status: "queued" } as never);
  const created = vi.fn();
  render(
    <ScientificForm form="reinvent.design" language="en" onCreated={created} />,
  );
  const user = userEvent.setup();
  const next = () => screen.getByRole("button", { name: "Next" });
  expect(
    screen.getByRole("textbox", { name: "Fragment structures (one per line)" }),
  ).toHaveValue(scaffold);
  await user.click(next());
  expect(
    screen.getByRole("region", { name: "Molecular design scope" }),
  ).toBeVisible();
  expect(screen.getByRole("img")).toHaveAttribute(
    "data-source",
    JSON.stringify({ smiles: scaffold }),
  );
  await user.click(next());
  await user.click(screen.getByRole("button", { name: "Expert tuning" }));
  const seed = screen.getByRole("spinbutton", {
    name: "Random seed",
  });
  await user.clear(seed);
  await user.type(seed, "2026");
  const memory = screen.getByRole("spinbutton", {
    name: "Memory budget (MiB)",
  });
  await user.clear(memory);
  await user.type(memory, "2048");
  await user.click(next());
  let review = screen.getByRole("table", { name: "Design plan review" });
  expect(
    within(review).getByRole("row", { name: "Candidate budget 20" }),
  ).toBeVisible();
  expect(within(review).getByText("2026")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("radio", { name: "50 candidates" }));
  await user.click(next());
  review = screen.getByRole("table", { name: "Design plan review" });
  expect(
    within(review).getByRole("row", { name: "Candidate budget 50" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Submit calculation" }));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "reinvent_design",
    inputs: [],
    scientific_inputs: [],
    payload: { mode: "r_groups", fragments: [scaffold], candidates: 50 },
    options: { device: "cpu", cpu: 2, memory_mib: 2048, seed: 2026 },
  });
  expect(submit.mock.calls[0][1]).toBeTruthy();
  expect(created).toHaveBeenCalledWith(
    expect.objectContaining({ id: "accepted-design" }),
  );
});
