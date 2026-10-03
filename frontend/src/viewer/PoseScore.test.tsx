import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PoseScore, type NativePoseScore } from "./PoseScore";
it("shows the exact native whole-pose score and explains that per-residue energy is unavailable", () => {
  render(
    <PoseScore
      language="zh"
      value={{
        value: -9.31584,
        unit: "kcal/mol",
        method: "GNINA 1.3.3",
        scoring: "vina",
        scope: "whole_pose",
      }}
    />,
  );
  expect(screen.getByText("-9.316 kcal/mol")).toBeVisible();
  expect(screen.getByText("GNINA 1.3.3 · vina")).toBeVisible();
  expect(screen.queryByText("逐残基作用能：未计算")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "作用大小说明" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "不是每个氨基酸的作用能",
  );
});
it("does not turn a missing or invalid score into zero, energy or affinity", () => {
  const { rerender } = render(<PoseScore language="en" />);
  expect(screen.queryByText(/kcal\/mol/)).toBeNull();
  for (const value of [NaN, Infinity]) {
    rerender(
      <PoseScore
        language="en"
        value={{
          value,
          unit: "kcal/mol",
          method: "GNINA",
          scope: "whole_pose",
        }}
      />,
    );
    expect(screen.queryByText(/Whole-pose docking score/)).toBeNull();
  }
  rerender(
    <PoseScore
      language="en"
      value={
        {
          value: -1,
          unit: "kcal/mol",
          method: "GNINA",
          scope: "residue",
        } as unknown as NativePoseScore
      }
    />,
  );
  expect(screen.queryByText(/Whole-pose docking score/)).toBeNull();
});
