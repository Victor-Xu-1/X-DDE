import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HarnessField } from "./HarnessField";
import { harnessFields } from "./harness-fields";

afterEach(cleanup);
const field = harnessFields.epitope.find(
  (value) => value.key === "cdr_regions",
)!;

it("shows all native heavy/light CDRs with one-based positions and retains their names after editing", async () => {
  const regions = {
    A: { CDR1_H: [1, 2], CDR2_H: [3], CDR3_H: [4] },
    B: { CDR1_L: [5], CDR2_L: [6], CDR3_L: [7] },
  };
  const before = structuredClone(regions);
  const onChange = vi.fn();
  render(
    <HarnessField
      field={field}
      tool="epitope"
      language="en"
      payload={{ antibody_chains: ["A", "B"], cdr_regions: regions }}
      onChange={onChange}
    />,
  );
  expect(screen.getByLabelText("A · CDR1_H")).toHaveValue("2,3");
  expect(screen.getByLabelText("B · CDR3_L")).toHaveValue("8");
  expect(screen.getAllByRole("textbox")).toHaveLength(6);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("A · CDR1_H"));
  await user.type(screen.getByLabelText("A · CDR1_H"), "5");
  expect(onChange.mock.lastCall?.[0]).toEqual({
    ...regions,
    A: { ...regions.A, CDR1_H: [4] },
  });
  expect(regions).toEqual(before);
});

it("uses distinct chain-qualified names for new manual regions without relabeling historical groups", () => {
  const props = {
    field,
    tool: "epitope",
    language: "zh" as const,
    onChange: vi.fn(),
  };
  const view = render(
    <HarnessField
      {...props}
      payload={{ antibody_chains: ["A", "B"], cdr_regions: {} }}
    />,
  );
  expect(screen.getByLabelText("A · CDR1_A")).toHaveValue("");
  expect(screen.getByLabelText("B · CDR1_B")).toHaveValue("");
  view.rerender(
    <HarnessField
      {...props}
      payload={{
        antibody_chains: ["A"],
        cdr_regions: { A: { CDR1: [2], CDR2: [3], CDR3: [4] } },
      }}
    />,
  );
  expect(screen.getByLabelText("A · CDR1")).toHaveValue("3");
  expect(screen.queryByLabelText("A · CDR1_A")).not.toBeInTheDocument();
});
