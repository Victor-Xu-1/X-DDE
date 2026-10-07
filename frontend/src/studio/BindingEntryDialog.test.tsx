import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, afterAll, beforeEach, expect, it, vi } from "vitest";
import { BindingEntryDialog } from "./BindingEntryDialog";
import { ModuleTaskPicker } from "./ModuleTaskPicker";
const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
});
afterAll(() => {
  if (originalShowModal) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      originalShowModal,
    );
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([
  ["已有参考复合物", "gnina.score"],
  ["结构和位点已知", "gnina.dock"],
  ["有结构，位点未知", "p2rank.detect"],
])(
  "routes %s to a real task only after explicit confirmation",
  async (label, tool) => {
    const select = vi.fn(),
      close = vi.fn(),
      user = userEvent.setup();
    render(
      <BindingEntryDialog language="zh" onSelect={select} onClose={close} />,
    );
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    expect(select).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: label }));
    expect(select).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(select).toHaveBeenCalledExactlyOnceWith(tool);
    expect(close).toHaveBeenCalledOnce();
  },
);
it.each([
  ["Protein sequence only", "predict"],
  ["An existing structure to inspect", "biopython.prepare"],
])("requires the structural prerequisite for %s", async (label, tool) => {
  const select = vi.fn(),
    user = userEvent.setup();
  render(
    <BindingEntryDialog language="en" onSelect={select} onClose={vi.fn()} />,
  );
  await user.click(
    screen.getByRole("radio", { name: "My structural evidence is incomplete" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(select).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("radio", { name: "I know the structure and site" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: label }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByRole("radio", { name: "My structural evidence is incomplete" }),
  ).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("radio", { name: label })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(select).toHaveBeenCalledExactlyOnceWith(tool);
});
it("leaves the existing task unchanged when the guide is cancelled", async () => {
  const select = vi.fn(),
    user = userEvent.setup();
  render(
    <ModuleTaskPicker value="p2rank.detect" language="zh" onChange={select} />,
  );
  await user.click(screen.getByRole("button", { name: "按已有材料开始" }));
  const dialog = screen.getByRole("dialog");
  await user.click(
    within(dialog).getByRole("radio", { name: "已有参考复合物" }),
  );
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("combobox", { name: "研究任务" })).toHaveValue(
    "p2rank.detect",
  );
  expect(screen.getByRole("button", { name: "按已有材料开始" })).toHaveFocus();
});
it("keeps unrelated modules free of binding-specific controls", () => {
  render(
    <ModuleTaskPicker value="admet.predict" language="en" onChange={vi.fn()} />,
  );
  expect(
    screen.queryByRole("button", { name: "Start from my evidence" }),
  ).toBeNull();
});
