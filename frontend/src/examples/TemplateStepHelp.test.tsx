import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ExampleContext } from "./context";
import { TemplateStepHelp } from "./TemplateStepHelp";
import type { PreparedExample } from "./types";

it("uses the active study step and shows missing materials instead of an archived hint", () => {
  const example = {
    template_active: true,
    module: { capability_id: "ligandmpnn.design" },
    study: {
      id: "stat6",
      required_materials: [["补齐真实序列", "Provide real sequences"]],
      guide: {
        steps: [["使用 STAT6 材料", "Use STAT6 inputs"]],
        interpretation: ["", ""],
      },
    },
  } as unknown as PreparedExample;
  render(
    <ExampleContext.Provider value={example}>
      <TemplateStepHelp language="en" step={0} />
    </ExampleContext.Provider>,
  );
  expect(screen.getByRole("note")).toHaveTextContent("Use STAT6 inputs");
  expect(screen.getByRole("note")).toHaveTextContent("Provide real sequences");
  expect(screen.queryByText(/BRD4/)).toBeNull();
});
