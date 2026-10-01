import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DockingForm } from "./DockingForm";
import { defaults } from "./generated";
const mocks = vi.hoisted(() => ({ request: vi.fn(), submit: vi.fn() }));
vi.mock("../api", () => ({ request: mocks.request }));
vi.mock("../operations/useTaskSubmit", () => ({
  useTaskSubmit: () => ({ submit: mocks.submit, busy: false, error: "" }),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ label }: { label: string }) => <div>{label}</div>,
}));
const receptor = {
    asset_id: "r",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  },
  ligand = { ...receptor, asset_id: "l" };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("resets hidden expert GPU settings when selecting the CPU preset", async () => {
  mocks.request.mockImplementation(async (path: string) =>
    path.startsWith("/research/constraints")
      ? []
      : { availability: { configuration_present: true } },
  );
  const user = userEvent.setup();
  render(
    <DockingForm
      language="zh"
      onCreated={() => {}}
      initialReceptor={receptor}
      initialLigand={ligand}
      initialBox={{ center: [1, 2, 3], size: [20, 20, 20], unit: "angstrom" }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(mocks.submit).not.toHaveBeenCalled();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "运行方案" }),
    "expert",
  );
  await user.click(screen.getByRole("checkbox", { name: "使用服务器 GPU" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "运行方案" }),
    "cpu",
  );
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "探索结合模式" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "探索结合模式" }));
  expect(mocks.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      options: defaults,
      search: expect.objectContaining({ frame: receptor }),
    }),
  );
});
it("keeps unavailable computation disabled and reports configuration failure", async () => {
  mocks.request.mockRejectedValue(new Error("connection unavailable"));
  const user = userEvent.setup();
  render(
    <DockingForm
      language="en"
      mode="score"
      initialReceptor={receptor}
      initialLigand={ligand}
      onCreated={() => {}}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "connection unavailable",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "Score existing pose" }),
  ).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
});
it("does not offer CNN search/refinement for scoring an existing pose", async () => {
  mocks.request.mockImplementation(async (path: string) =>
    path.startsWith("/research/constraints")
      ? []
      : { availability: { configuration_present: true } },
  );
  const user = userEvent.setup();
  render(
    <DockingForm
      language="en"
      mode="score"
      onCreated={() => {}}
      initialReceptor={receptor}
      initialLigand={ligand}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Run preset" }),
    "expert",
  );
  expect(
    screen.queryByRole("option", { name: "Refinement (GPU required)" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Score existing pose" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Score existing pose" }));
  expect(mocks.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "score",
      receptor,
      ligand,
      pose_frame: receptor,
      pose_coordinate_basis: "user_confirmed",
    }),
  );
});
