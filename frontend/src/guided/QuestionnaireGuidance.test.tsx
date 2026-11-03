import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import { ScientificForm } from "../integrations/ScientificForm";
import type { ScientificTask } from "../integrations/types";
import { SimulationForm } from "../simulations/SimulationForm";
import type { Language } from "../types";

vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ label }: { label: string }) => <p>{label}</p>,
}));
vi.mock("../simulations/RestraintEditor", () => ({
  RestraintEditor: () => <p>Interactive atom selection</p>,
}));
vi.mock("../api", async () => {
  const original = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...original,
    request: vi.fn(),
    api: { ...original.api, submit: vi.fn() },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const source = {
  asset_id: "11111111-1111-4111-8111-111111111111",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const instructions: [string, string][] = [
  ["核对真实结构材料", "Check the original structure"],
  ["保留主链约束", "Keep the backbone restraints"],
  ["检查 pH 与计算预算", "Review pH and the calculation budget"],
  ["确认材料和研究条件", "Confirm the inputs and study conditions"],
];

it.each(
  (["en", "zh"] as const).flatMap((language) =>
    (["refinement", "openmm", "gromacs"] as const).map((method) => ({
      language,
      method,
    })),
  ),
)(
  "keeps $method template instructions associated with the actual $language question",
  async ({ language, method }) => {
    vi.mocked(request).mockResolvedValue({
      id: source.asset_id,
      sha256: source.sha256,
      name: "STAT6-reference.pdb",
    });
    const example: PreparedExample = {
      template_active: true,
      module: {
        capability_id:
          method === "refinement" ? "openmm.refine" : `${method}.dynamics`,
        case_id: "stat6-guidance",
        revision: 1,
      },
      case: {
        id: "stat6-guidance",
        revision: 1,
        label: ["STAT6 条件引导", "STAT6 condition guidance"],
        description: ["仅验证界面提示", "Interface instructions only"],
        sources: [],
      },
      objects: {},
      sequences: {},
      sources: [],
      study: {
        id: "stat6",
        target: "STAT6",
        organism: "Homo sapiens",
        template_kind: "research_study",
        required_materials: [],
        guide: { steps: instructions, interpretation: ["", ""] },
      },
    };
    const initialTask = {
      operation:
        method === "gromacs" ? "gromacs_dynamics" : "molecular_dynamics",
      inputs: [{ role: "structure", source }],
      options: { device: "cpu", cpu: 2, memory_mib: 4096, seed: 101 },
      payload: { kind: method },
    } as unknown as ScientificTask;
    const user = userEvent.setup();
    render(
      <ExampleContext.Provider value={example}>
        {method === "refinement" ? (
          <ScientificForm
            form="openmm.refine"
            initialStructure={source}
            language={language as Language}
            onCreated={vi.fn()}
          />
        ) : (
          <SimulationForm
            form={method === "gromacs" ? "gromacs.dynamics" : "openmm.dynamics"}
            initialTask={initialTask}
            language={language as Language}
            onCreated={vi.fn()}
          />
        )}
      </ExampleContext.Provider>,
    );
    const column = language === "zh" ? 0 : 1;
    const next = () =>
      user.click(
        screen.getByRole("button", {
          name: language === "zh" ? "下一步" : "Next",
        }),
      );
    expect(screen.getByRole("note")).toHaveTextContent(instructions[0][column]);
    await next();
    expect(screen.getByRole("note")).toHaveTextContent(instructions[1][column]);
    await next();
    if (method === "refinement") {
      expect(screen.getByText("Interactive atom selection")).toBeVisible();
      expect(screen.queryByRole("note")).toBeNull();
      await next();
    }
    expect(screen.getByRole("note")).toHaveTextContent(instructions[2][column]);
    await next();
    if (method === "openmm") {
      expect(screen.getByText("Interactive atom selection")).toBeVisible();
      expect(screen.queryByRole("note")).toBeNull();
      await next();
    }
    expect(screen.getByRole("note")).toHaveTextContent(instructions[3][column]);
    expect(api.submit).not.toHaveBeenCalled();
  },
);
