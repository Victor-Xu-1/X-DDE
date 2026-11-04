import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DockingForm } from "./DockingForm";
import { defaults } from "./generated";
import type { DockingJobInput } from "./docking-job-request";
const mocks = vi.hoisted(() => ({ request: vi.fn(), submit: vi.fn() }));
vi.mock("../api", () => ({ request: mocks.request }));
vi.mock("./docking-job-request", () => ({
  prepareDockingJob: async ({ task }: DockingJobInput) => ({
    task,
    components: [],
  }),
}));
vi.mock("../viewer/StructureViewer", () => ({ StructureViewer: () => null }));
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
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}
async function preview(user: ReturnType<typeof userEvent.setup>, zh = false) {
  const label = zh ? "预览任务" : "Preview job";
  await user.click(screen.getByRole("button", { name: label }));
  return within(await screen.findByRole("dialog", { name: label }));
}
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
  const review = await preview(user, true);
  await user.click(await review.findByRole("button", { name: "提交内容" }));
  const shown = JSON.parse(
    review.getByLabelText("X-DDE 提交请求").textContent!,
  );
  expect(mocks.submit).not.toHaveBeenCalled();
  await user.click(review.getByRole("button", { name: "提交任务" }));
  expect(mocks.submit).toHaveBeenCalledWith(shown);
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
    "The calculation environment could not be checked.",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  const review = await preview(user);
  expect(review.getByRole("button", { name: "Submit job" })).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
  mocks.request.mockImplementation(async (path: string) =>
    path.startsWith("/research/constraints")
      ? []
      : { availability: { configuration_present: true } },
  );
  await user.click(
    review.getByRole("button", { name: "Check environment again" }),
  );
  await waitFor(() =>
    expect(review.getByRole("button", { name: "Submit job" })).toBeEnabled(),
  );
  expect(screen.queryByRole("alert")).toBeNull();
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
  const review = await preview(user);
  await user.click(review.getByRole("button", { name: "Submit job" }));
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

it("retains a handed-off reference ligand and requires coordinate confirmation", async () => {
  mocks.request.mockImplementation(async (path: string) =>
    path.startsWith("/research/constraints")
      ? []
      : { availability: { configuration_present: true } },
  );
  const reference = {
    ...ligand,
    asset_id: "reference",
    sha256: "b".repeat(64),
  };
  const user = userEvent.setup();
  render(
    <DockingForm
      language="en"
      onCreated={() => {}}
      initialReceptor={receptor}
      initialLigand={ligand}
      initialReference={reference}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  const confirmed = screen.getByRole("checkbox", {
    name: /confirm the reference\/existing pose/i,
  });
  expect(confirmed).not.toBeChecked();
  await user.click(confirmed);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  const review = await preview(user);
  await user.click(review.getByRole("button", { name: "Submit job" }));
  expect(mocks.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      search: expect.objectContaining({ kind: "reference_ligand", reference }),
    }),
  );
});
