import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SequenceScoreResults } from "./SequenceScoreResults";
vi.mock("../presentation/MetricScatter", () => ({ MetricScatter: () => null }));
afterEach(cleanup);

it("selects the exact scored sequence and resets when result inputs are replaced", async () => {
  const user = userEvent.setup();
  const view = render(
    <SequenceScoreResults
      sequences={["ACDEFG", "YVKLWT"]}
      scores={[-0.695312, -1.16751]}
      language="en"
    />,
  );
  await user.click(
    within(
      screen.getByRole("table", { name: "Input sequence scores" }),
    ).getByRole("button", { name: "Sequence 2" }),
  );
  expect(screen.getByRole("region", { name: "Sequence 2" })).toHaveTextContent(
    "Y",
  );
  view.rerender(
    <SequenceScoreResults
      sequences={["PQRS", "LMNO"]}
      scores={[-0.8, -1.8]}
      language="en"
    />,
  );
  expect(screen.getByRole("region", { name: "Sequence 1" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "Sequence 2" })).toBeNull();
  expect(screen.getByText("-0.8000")).toHaveAttribute("title", "-0.8");
});

it("shows missing scores and missing source sequences without inventing either", async () => {
  const view = render(
    <SequenceScoreResults
      sequences={["ACDEFG", "YVKLWT"]}
      scores={[-0.6]}
      language="en"
    />,
  );
  expect(
    screen
      .getByRole("table", { name: "Input sequence scores" })
      .querySelectorAll("tbody tr"),
  ).toHaveLength(2);
  expect(screen.getByText("—")).toBeVisible();
  view.rerender(
    <SequenceScoreResults sequences={[]} scores={[-0.6]} language="en" />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No input sequence accompanies this score",
  );
  expect(screen.queryByRole("region", { name: "Sequence 1" })).toBeNull();
});
