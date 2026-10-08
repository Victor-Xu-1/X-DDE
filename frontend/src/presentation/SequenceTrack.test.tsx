import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SequenceTrack } from "./SequenceTrack";
afterEach(cleanup);

it("binds residue selection to the displayed source rather than retaining an index on a different sequence", async () => {
  const user = userEvent.setup();
  const view = render(
    <SequenceTrack sequence="ACDEFGH" label="Source" language="en" />,
  );
  await user.click(screen.getByRole("button", { name: "Source · 5 F" }));
  expect(screen.getByRole("button", { name: "Source · 5 F" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  view.rerender(
    <SequenceTrack sequence="YVKLWTR" label="Source" language="en" />,
  );
  expect(screen.getByRole("button", { name: "Source · 5 W" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.queryByText("Sequence position 5 · W")).toBeNull();
});

it("region navigation reports the exact one-based source position and permits controlled selection", async () => {
  const select = vi.fn(),
    user = userEvent.setup();
  const props = {
    sequence: "ACDEFGH",
    label: "Input",
    language: "en" as const,
    regions: [{ start: 3, end: 5, label: "CDR1" }],
    onSelect: select,
  };
  const view = render(<SequenceTrack {...props} selectedPosition={null} />);
  await user.click(screen.getByRole("button", { name: "CDR1" }));
  expect(select).toHaveBeenCalledWith(3);
  view.rerender(<SequenceTrack {...props} selectedPosition={3} />);
  expect(
    screen.getByRole("button", { name: "Input · 3 D · CDR1" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Sequence position 3 · D · CDR1")).toBeVisible();
  view.rerender(<SequenceTrack {...props} selectedPosition={30} />);
  expect(
    screen.getByRole("button", { name: "Input · 3 D · CDR1" }),
  ).toHaveAttribute("aria-pressed", "false");
});
