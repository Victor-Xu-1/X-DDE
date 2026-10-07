import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FileSelect } from "./FileSelect";
afterEach(cleanup);
it("preserves the actual native file, accepted format and accessible purpose", async () => {
  const selected = vi.fn(),
    user = userEvent.setup();
  render(
    <FileSelect
      language="zh"
      aria-label="上传蛋白结构"
      accept=".pdb,.cif"
      onChange={(event) => selected(event.target.files?.[0])}
    />,
  );
  const file = new File(["ATOM      1"], "BRD4_reference.pdb", {
    type: "chemical/x-pdb",
  });
  const control = screen.getByLabelText("上传蛋白结构") as HTMLInputElement;
  await user.upload(control, file);
  expect(selected).toHaveBeenCalledExactlyOnceWith(file);
  expect(control.files?.[0]).toBe(file);
  expect(control.accept).toBe(".pdb,.cif");
  expect(screen.getByText(file.name)).toBeVisible();
});
it("keeps disabled upload unavailable and localizes its visible choice", async () => {
  const selected = vi.fn(),
    user = userEvent.setup();
  render(
    <FileSelect
      language="zh"
      aria-label="上传分子"
      disabled
      onChange={selected}
    />,
  );
  await user.upload(
    screen.getByLabelText("上传分子"),
    new File(["record"], "MZ1.sdf"),
  );
  expect(selected).not.toHaveBeenCalled();
  expect(screen.getByText("点击选择文件")).toBeVisible();
});
it("respects a caller's same-file reopen reset instead of showing stale selection", async () => {
  const selected = vi.fn(),
    user = userEvent.setup();
  render(
    <FileSelect
      language="en"
      aria-label="Open molecule"
      variant="compact"
      onChange={(event) => {
        selected(event.target.files?.[0]);
        event.target.value = "";
      }}
    />,
  );
  const file = new File(["record"], "MZ1.sdf");
  const control = screen.getByLabelText("Open molecule") as HTMLInputElement;
  await user.upload(control, file);
  await user.upload(control, file);
  expect(selected).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Choose a file")).toBeVisible();
  expect(screen.queryByText(file.name)).toBeNull();
});
