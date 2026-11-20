import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { PredictionSetup } from "./PredictionSetup";

it.each(["en", "zh"] as const)(
  "keeps reproducibility details collapsed while preserving current values in %s",
  (language) => {
    const zh = language === "zh";
    const view = render(
      <PredictionSetup
        language={language}
        components={[
          { kind: "protein", value: "MKT", count: 2 },
          { kind: "ligand", value: "O=C(N)c1ccccc1", count: 1 },
        ]}
        model="Mol-1"
        seeds={[101, 202]}
        samples={5}
        valid
      >
        <p>Current form</p>
      </PredictionSetup>,
    );
    const aside = within(view.container).getByRole("complementary");
    const seeds = within(aside).getByText(zh ? "随机种子" : "Seeds");
    expect(seeds).not.toBeVisible();
    expect(
      within(aside).getByText(zh ? "总拷贝数" : "Total copies"),
    ).not.toBeVisible();
    expect(
      within(aside).getByText(zh ? "请求构象" : "Requested structures"),
    ).toBeVisible();
    expect(within(aside).getByText("Mol-1")).toBeVisible();
    fireEvent.click(
      within(aside).getByText(zh ? "计算详情" : "Calculation details"),
    );
    expect(seeds).toBeVisible();
    expect(seeds.nextSibling).toHaveTextContent("101, 202");
    expect(
      within(aside).getByText(zh ? "总拷贝数" : "Total copies").nextSibling,
    ).toHaveTextContent("3");
    expect(
      within(aside).getByText(zh ? "请求构象" : "Requested structures")
        .nextSibling,
    ).toHaveTextContent("10");
    view.unmount();
  },
);

it.each(["en", "zh"] as const)(
  "guides unfinished seed values without rendering internal numbers in %s",
  (language) => {
    const view = render(
      <PredictionSetup
        language={language}
        components={[]}
        model="Mol-1"
        seeds={[-1, NaN, Infinity]}
        samples={5}
        valid={false}
      >
        <input />
      </PredictionSetup>,
    );
    const aside = within(view.container).getByRole("complementary");
    expect(aside).toHaveTextContent(
      language === "zh" ? "检查种子数值" : "Check seed values",
    );
    expect(within(aside).getByRole("status")).toBeVisible();
    expect(
      within(aside).getByText(
        language === "zh" ? "检查种子数值" : "Check seed values",
      ),
    ).toBeVisible();
    expect(aside).not.toHaveTextContent(/NaN|Infinity/);
    expect(within(aside).getByText("—")).toBeVisible();
    view.unmount();
  },
);

it("keeps unfinished sample settings visible without changing the questionnaire or inventing a count", () => {
  const view = render(
    <PredictionSetup
      language="en"
      components={[]}
      model="Boltz-2"
      seeds={[101]}
      samples={NaN}
      valid={false}
    >
      <input aria-label="Actual sample setting" value="" readOnly />
    </PredictionSetup>,
  );
  const aside = within(view.container).getByRole("complementary");
  expect(within(aside).getByRole("status")).toHaveTextContent(
    "Check calculation settings.",
  );
  expect(within(aside).getByText("Seeds")).toBeVisible();
  expect(within(aside).getByText("—")).toBeVisible();
  expect(aside).not.toHaveTextContent(/NaN|Infinity/);
  expect(
    within(view.container).getByLabelText("Actual sample setting"),
  ).toHaveValue("");
  view.unmount();
});

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

it("downloads the selected Boltz ligand record from the setup summary", () => {
  render(
    <PredictionSetup
      language="en"
      components={[
        { kind: "ligand", value: "", count: 1, ligand_file: "library-file", ligand_record: 7 },
      ]}
      model="Boltz-2"
      seeds={[101]}
      samples={1}
      valid
    >
      <p>Task form</p>
    </PredictionSetup>,
  );
  fireEvent.click(screen.getByLabelText("Ligand input 1"));
  expect(screen.getByRole("link", { name: "Download selected structure input" }))
    .toHaveAttribute("href", "/api/assets/library-file?record=7");
});
