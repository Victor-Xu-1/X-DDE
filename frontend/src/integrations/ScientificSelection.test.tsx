import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ScientificSelection } from "./ScientificSelection";

afterEach(cleanup);

it.each([
  ["en", "Label units", "Experimental label field in SDF"],
  ["zh", "标签单位", "SDF 中的实验标签名称"],
] as const)(
  "preserves the SPR pKd endpoint in the %s training questionnaire",
  async (language, unitLabel, fieldLabel) => {
    const change = vi.fn();
    render(
      <ScientificSelection
        language={language}
        program="chemprop"
        structure={null}
        payload={{
          kind: "chemprop",
          mode: "train",
          activity_property: "pKd",
          activity_unit: "pKd",
          epochs: 30,
        }}
        onChange={change}
        onValid={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: unitLabel })).toHaveValue(
      "pKd",
    );
    expect(screen.getByRole("textbox", { name: fieldLabel })).toHaveValue(
      "pKd",
    );
    await userEvent
      .setup()
      .selectOptions(screen.getByRole("combobox", { name: unitLabel }), "nM");
    expect(change).toHaveBeenCalledExactlyOnceWith({ activity_unit: "nM" });
  },
);
