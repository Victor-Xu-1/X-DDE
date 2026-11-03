import { fireEvent, render, screen, within } from "@testing-library/react";
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

it("reviews the current entity value and the exact selected file without exposing stale text", () => {
  const p = {
    language: "en" as const,
    model: "Mol-1",
    seeds: [101],
    samples: 5,
    valid: true,
  };
  const view = render(
    <PredictionSetup
      {...p}
      components={[{ kind: "protein", value: "CURRENT_SEQUENCE_A", count: 1 }]}
    >
      <p>Task form</p>
    </PredictionSetup>,
  );
  const aside = screen.getByRole("complementary", { name: "Study setup" });
  fireEvent.click(within(aside).getByLabelText("Protein input 1"));
  expect(within(aside).getByText("CURRENT_SEQUENCE_A")).toBeVisible();
  view.rerender(
    <PredictionSetup
      {...p}
      components={[
        { kind: "protein", value: "EDITED_SEQUENCE_B", count: 1 },
        {
          kind: "ligand",
          value: "STALE_SMILES",
          ligand_file: "selected-native-file",
          count: 1,
        },
      ]}
    >
      <p>Task form</p>
    </PredictionSetup>,
  );
  expect(within(aside).queryByText("CURRENT_SEQUENCE_A")).toBeNull();
  expect(within(aside).getByText("EDITED_SEQUENCE_B")).toBeVisible();
  fireEvent.click(within(aside).getByLabelText("Ligand input 2"));
  expect(
    within(aside).getByRole("link", {
      name: "Download selected structure input",
    }),
  ).toHaveAttribute("href", "/api/assets/selected-native-file");
  expect(within(aside).queryByText("STALE_SMILES")).toBeNull();
});
