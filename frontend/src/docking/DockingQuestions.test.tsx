import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DockingRegion } from "./DockingQuestions";
import type { MoleculeRef } from "../research/types";

vi.mock("./SearchRegion", () => ({ SearchRegion: () => null }));
vi.mock("./BoxFields", () => ({ BoxFields: () => null }));
afterEach(cleanup);

const receptor: MoleculeRef = {
  asset_id: "11111111-1111-4111-8111-111111111111",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const reference: MoleculeRef = {
  ...receptor,
  asset_id: "22222222-2222-4222-8222-222222222222",
};

it("waits for resolved reference identity before accepting a coordinate confirmation", async () => {
  const user = userEvent.setup();
  const onConfirmed = vi.fn();
  const props = {
    language: "en" as const,
    mode: "dock" as const,
    receptor,
    kind: "reference" as const,
    center: ["", "", ""],
    size: ["20", "20", "20"],
    confirmed: false,
    onKind: vi.fn(),
    onReference: vi.fn(),
    onCenter: vi.fn(),
    onSize: vi.fn(),
    onConfirmed,
  };
  const { rerender } = render(<DockingRegion {...props} reference={null} />);
  const confirmation = () =>
    screen.getByRole("checkbox", { name: /I confirm/ });
  expect(confirmation()).toBeDisabled();
  await user.click(confirmation());
  expect(onConfirmed).not.toHaveBeenCalled();

  // ReferencePicker deliberately clears the previous reference while its
  // asynchronous format, SHA and record-identity checks are in flight.
  rerender(<DockingRegion {...props} reference={reference} />);
  expect(confirmation()).toBeEnabled();
  await user.click(confirmation());
  expect(onConfirmed).toHaveBeenLastCalledWith(true);

  onConfirmed.mockClear();
  rerender(<DockingRegion {...props} reference={null} />);
  expect(confirmation()).toBeDisabled();
  await user.click(confirmation());
  expect(onConfirmed).not.toHaveBeenCalled();
});

it("also requires a resolved receptor and keeps existing-pose confirmation available without a search reference", () => {
  const props = {
    language: "zh" as const,
    mode: "score" as const,
    kind: "reference" as const,
    reference: null,
    center: ["", "", ""],
    size: ["20", "20", "20"],
    confirmed: false,
    onKind: vi.fn(),
    onReference: vi.fn(),
    onCenter: vi.fn(),
    onSize: vi.fn(),
    onConfirmed: vi.fn(),
  };
  const { rerender } = render(<DockingRegion {...props} receptor={null} />);
  expect(screen.getByRole("checkbox")).toBeDisabled();
  rerender(<DockingRegion {...props} receptor={receptor} />);
  expect(screen.getByRole("checkbox")).toBeEnabled();
});
