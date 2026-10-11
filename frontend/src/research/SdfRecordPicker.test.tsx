import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SdfRecordPicker } from "./SdfRecordPicker";
const base = {
  asset_id: "STAT6-library",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
it("invalid or empty records make the input ineligible without silently retaining a prior record", () => {
  const change = vi.fn();
  render(<SdfRecordPicker base={base} language="en" onChange={change} />);
  const control = screen.getByRole("spinbutton");
  for (const value of ["", "0", "2.5", "501"]) {
    fireEvent.change(control, { target: { value } });
    expect(change).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("alert")).toBeVisible();
  }
  fireEvent.change(control, { target: { value: "3" } });
  expect(change).toHaveBeenLastCalledWith({ ...base, record: 2 });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(base.record).toBe(0);
});
