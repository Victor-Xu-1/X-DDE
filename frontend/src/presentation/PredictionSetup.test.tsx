import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { PredictionSetup } from "./PredictionSetup";

it("reflects edited components, uploaded ligands and all requested seeds without claiming a computation", () => {
  const p = {
    language: "en" as const,
    components: [{ kind: "protein" as const, value: "", count: 1 }],
    model: "Mol-1",
    seeds: [101],
    samples: 5,
    valid: false,
  };
  const view = render(
    <PredictionSetup {...p}>
      <input aria-label="Actual questionnaire" />
    </PredictionSetup>,
  );
  const aside = screen.getByRole("complementary", { name: "Study setup" });
  expect(aside).toHaveTextContent("Not provided");
  expect(aside).toHaveTextContent("Complete the study inputs");
  view.rerender(
    <PredictionSetup
      {...p}
      components={[
        { kind: "protein", value: "MKT", count: 2 },
        {
          kind: "ligand",
          value: "",
          ligand_file: "saved-native-file",
          count: 1,
        },
      ]}
      seeds={[101, 202]}
      valid
    >
      <input aria-label="Actual questionnaire" />
    </PredictionSetup>,
  );
  expect(within(aside).getByText("Total copies").nextSibling).toHaveTextContent(
    "3",
  );
  expect(
    within(aside).getByText("Requested structures").nextSibling,
  ).toHaveTextContent("10");
  expect(within(aside).queryByText("Not provided")).toBeNull();
  expect(screen.getByLabelText("Actual questionnaire")).toBeVisible();
  expect(screen.queryByRole("button", { name: /submit|run/i })).toBeNull();
});

it("does not add prediction controls to another scientific operation", () => {
  render(
    <PredictionSetup
      language="en"
      components={[]}
      model="Boltz-2"
      seeds={[101]}
      samples={1}
      valid={false}
      enabled={false}
    >
      <p>Other operation</p>
    </PredictionSetup>,
  );
  expect(screen.getByText("Other operation")).toBeVisible();
  expect(screen.queryByRole("complementary")).toBeNull();
});
