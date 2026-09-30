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
  mocks.request.mockResolvedValue({
    availability: { configuration_present: true },
  });
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
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "探索结合模式" })).toBeEnabled(),
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "运行方案" }),
    "expert",
  );
  await user.click(screen.getByRole("checkbox", { name: "使用服务器 GPU" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "运行方案" }),
    "cpu",
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
  render(<DockingForm language="en" onCreated={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "connection unavailable",
  );
  expect(
    screen.getByRole("button", { name: "Explore binding poses" }),
  ).toBeDisabled();
});
it("does not offer CNN search/refinement for scoring an existing pose", async () => {
  mocks.request.mockResolvedValue({
    availability: { configuration_present: true },
  });
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
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Run preset" }),
    "expert",
  );
  expect(
    screen.queryByRole("option", { name: "Refinement (GPU required)" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Score existing pose" }));
  expect(mocks.submit).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Confirm");
});
