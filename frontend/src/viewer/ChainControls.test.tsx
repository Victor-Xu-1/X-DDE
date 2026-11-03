import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChainControls } from "./ChainControls";

it("uses acknowledged display state and sends exact chain commands, including unnamed chains", () => {
  const onDisplay = vi.fn(),
    onFocus = vi.fn();
  const { rerender } = render(
    <ChainControls
      language="en"
      chains={["A", "AB", ""]}
      hidden={[]}
      onDisplay={onDisplay}
      onFocus={onFocus}
    />,
  );
  fireEvent.click(screen.getByText("Chains 3 / 3"));
  const box = screen.getByRole("checkbox", { name: "Show chain AB" });
  fireEvent.click(box);
  expect(onDisplay).toHaveBeenLastCalledWith({ action: "hide", chain: "AB" });
  expect(box).toBeChecked();
  rerender(
    <ChainControls
      language="en"
      chains={["A", "AB", ""]}
      hidden={["AB"]}
      onDisplay={onDisplay}
      onFocus={onFocus}
    />,
  );
  expect(box).not.toBeChecked();
  fireEvent.click(
    screen.getByRole("button", { name: "Show only chain Unnamed" }),
  );
  expect(onDisplay).toHaveBeenLastCalledWith({ action: "only", chain: "" });
  fireEvent.click(screen.getByRole("button", { name: "Focus chain A" }));
  expect(onFocus).toHaveBeenLastCalledWith("A");
  fireEvent.click(screen.getByRole("button", { name: "Show all chains" }));
  expect(onDisplay).toHaveBeenLastCalledWith({ action: "all" });
});

it("keeps every chain reachable with translated controls", () => {
  render(
    <ChainControls
      language="zh"
      chains={Array.from({ length: 12 }, (_, i) => String(i))}
      hidden={[]}
      onDisplay={vi.fn()}
      onFocus={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("链 12 / 12"));
  expect(screen.getByRole("checkbox", { name: "显示链 11" })).toBeChecked();
  expect(screen.getByRole("button", { name: "显示全部链" })).toBeDisabled();
});
