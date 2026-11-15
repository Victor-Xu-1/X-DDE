import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { IntegerListField } from "./IntegerListField";
import { validIntegerTexts } from "./integer-list-model";
import { defaults } from "../form-model";

it("marks restored invalid text as invalid without submitting the last valid numeric list", async () => {
  const change = vi.fn(),
    raw = vi.fn();
  const { rerender } = render(
    <IntegerListField
      value={[2]}
      text="2, unfinished"
      onChange={change}
      onTextChange={raw}
      max={10}
      count={3}
      label="Seeds"
    />,
  );
  const input = screen.getByLabelText("Seeds");
  expect(input).toHaveValue("2, unfinished");
  expect(input).toBeInvalid();
  expect(input).toHaveAccessibleDescription(
    "Use up to 3 distinct integers from 0 to 10.",
  );
  expect(screen.getByRole("alert")).toBeVisible();
  expect(change).not.toHaveBeenCalled();
  rerender(
    <IntegerListField
      value={[2]}
      text="2，3"
      onChange={change}
      max={10}
      count={3}
      label="Seeds"
    />,
  );
  expect(input).toBeValid();
  expect(input).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.clear(input);
  expect(change).toHaveBeenLastCalledWith([]);
});
it("keeps standalone consumers editable and follows later canonical changes", async () => {
  const change = vi.fn();
  const { rerender } = render(
    <IntegerListField
      value={[2]}
      onChange={change}
      max={10}
      count={3}
      label="GPU"
    />,
  );
  const input = screen.getByLabelText("GPU");
  const user = userEvent.setup();
  await user.type(input, ",no");
  expect(input).toHaveValue("2,no");
  expect(input).toBeInvalid();
  act(() =>
    rerender(
      <IntegerListField
        value={[4]}
        onChange={change}
        max={10}
        count={3}
        label="GPU"
      />,
    ),
  );
  expect(input).toHaveValue("4");
  expect(input).toBeValid();
});
it("blocks hidden raw/native mismatches, duplicate seeds and CPU GPU indices", () => {
  expect(validIntegerTexts(defaults, {})).toBe(true);
  expect(
    validIntegerTexts(
      { ...defaults, additional_seeds: [2] },
      { additional_seeds: "3" },
    ),
  ).toBe(false);
  expect(validIntegerTexts({ ...defaults, additional_seeds: [101] }, {})).toBe(
    false,
  );
  expect(validIntegerTexts({ ...defaults, seed: 4294967295 }, {})).toBe(true);
  expect(
    validIntegerTexts({ ...defaults, device: "cpu", gpu_ids: [0] }, {}),
  ).toBe(false);
});
