import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { OutputConditionControls } from "./OutputConditionControls";
it("keeps beginner choices simple and exposes explicit expert tolerance and soft semantics", async () => {
  const onSettings = vi.fn(),
    user = userEvent.setup();
  const { rerender } = render(
    <OutputConditionControls
      language="zh"
      choice="all_heavy_atoms"
      onChoice={vi.fn()}
      expert={false}
      settings={{ strength: "hard", weight: 1, tolerance_angstrom: 0.001 }}
      onSettings={onSettings}
    />,
  );
  expect(screen.getByText(/失败候选不会自动复用/)).toBeVisible();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  rerender(
    <OutputConditionControls
      language="en"
      choice="all_heavy_atoms"
      onChoice={vi.fn()}
      expert
      settings={{ strength: "soft", weight: 2, tolerance_angstrom: 0.001 }}
      onSettings={onSettings}
    />,
  );
  expect(
    screen.getByRole("spinbutton", { name: "Deviation weight" }),
  ).toHaveValue(2);
  expect(
    screen.getByText(/Record deviations without excluding candidates/),
  ).toBeVisible();
  await user.clear(
    screen.getByRole("spinbutton", { name: "Numerical tolerance (Å)" }),
  );
  expect(onSettings).toHaveBeenCalledWith(
    expect.objectContaining({ tolerance_angstrom: NaN }),
  );
});
