import { useState, type ReactNode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { ExampleInfo, PreparedExample } from "../examples/types";
import { useExample } from "../examples/context";
import { UtilityTask, type MolecularUtility } from "./UtilityTask";

const transport = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({
  request: transport.request,
  api: { post: transport.post },
}));
vi.mock("../examples/ExampleResultSet", () => ({
  ExampleResultSet: ({ job, primary }: { job?: Job; primary?: ReactNode }) =>
    primary ?? <p>Saved output {job?.id}</p>,
}));
vi.mock("../examples/ExampleRecordResult", () => ({
  ExampleRecordResult: () => <p>Reference input preview</p>,
}));
function MoleculeForm({ onCreated }: { onCreated(job: Job): void }) {
  const example = useExample();
  const [value, setValue] = useState(example?.case.label[1] ?? "");
  return (
    <>
      <input
        aria-label="Molecule input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <output aria-label="Template capability">
        {example?.module.capability_id ?? "blank"}
      </output>
      <button onClick={() => onCreated({ id: "accepted" } as Job)}>
        Accept task
      </button>
    </>
  );
}
vi.mock("../admet/AdmetForm", () => ({ AdmetForm: MoleculeForm }));
vi.mock("../operations/PropertyForm", () => ({ PropertyForm: MoleculeForm }));
vi.mock("../chemistry/LibraryScreenForm", () => ({
  LibraryScreenForm: MoleculeForm,
}));
vi.mock("../chemistry/StateForm", () => ({ StateForm: MoleculeForm }));

const tools = [
  ["admet", "admet.predict"],
  ["brain", "admet.brain"],
  ["properties", "properties"],
  ["screen", "chemistry.screen"],
  ["states", "chemistry.states"],
] as const;
function metadata(capability: string): ExampleInfo {
  return {
    module: {
      capability_id: capability,
      case_id: "stat6-defined-molecules",
      revision: 3,
    },
    case: {
      id: "stat6-defined-molecules",
      revision: 3,
      label: ["STAT6 模板", "STAT6 " + capability],
      description: ["研究输入", "Study input"],
      sources: ["https://www.uniprot.org/uniprotkb/P42226/entry"],
    },
    files: [],
    computed_result_available: capability !== "admet.brain",
    pin:
      capability === "admet.brain"
        ? null
        : { job_id: "saved-" + capability, artifact_sha256: {} },
    study:
      capability === "admet.brain"
        ? {
            id: "stat6",
            target: "STAT6",
            organism: "Homo sapiens",
            template_kind: "research_study",
            required_materials: [],
            guide: { steps: [], interpretation: ["输入", "Input"] },
          }
        : undefined,
  };
}
function prepared(capability: string): PreparedExample {
  const info = metadata(capability);
  return {
    module: info.module,
    case: info.case,
    study: info.study,
    objects: {},
    sequences: {},
    sources: info.case.sources,
  };
}
beforeEach(() => {
  transport.request
    .mockReset()
    .mockImplementation(async (path: string) =>
      path.startsWith("/jobs/")
        ? { id: path.slice(6), status: "succeeded" }
        : metadata(path.split("/")[2]),
    );
  transport.post
    .mockReset()
    .mockImplementation(async (path: string) => prepared(path.split("/")[2]));
});
afterEach(cleanup);

it.each(
  tools.flatMap(([tool, capability]) =>
    (["en", "zh"] as const).map((language) => ({ tool, capability, language })),
  ),
)(
  "loads, previews and clears the exact $tool template ($language)",
  async ({ tool, capability, language }) => {
    const user = userEvent.setup(),
      zh = language === "zh",
      onCreated = vi.fn();
    render(
      <UtilityTask tool={tool} language={language} onCreated={onCreated} />,
    );
    const input = screen.getByLabelText("Molecule input");
    expect(input).toHaveValue("");
    expect(transport.post).not.toHaveBeenCalled();
    await user.click(
      await screen.findByRole("button", {
        name: zh ? "使用此模板" : "Use this template",
      }),
    );
    expect(input).not.toBeInTheDocument();
    expect(screen.getByLabelText("Molecule input")).toHaveValue(
      "STAT6 " + capability,
    );
    expect(screen.getByLabelText("Template capability")).toHaveTextContent(
      capability,
    );
    expect(transport.post).toHaveBeenCalledWith(
      `/examples/${capability}/prepare`,
      {},
    );
    await user.type(screen.getByLabelText("Molecule input"), " edited");
    const preview =
      capability === "admet.brain"
        ? zh
          ? "查看研究材料"
          : "Preview study inputs"
        : zh
          ? "示例结果"
          : "Example results";
    await user.click(screen.getByRole("button", { name: preview }));
    expect(
      await screen.findByText(
        capability === "admet.brain"
          ? "Reference input preview"
          : "Saved output saved-" + capability,
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Molecule input")).not.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: zh ? "返回任务填写" : "Return to task form",
      }),
    );
    expect(screen.getByLabelText("Molecule input")).toHaveValue(
      "STAT6 " + capability + " edited",
    );
    await user.click(
      screen.getByRole("button", {
        name: zh ? "新建空白任务" : "New blank task",
      }),
    );
    expect(screen.getByLabelText("Molecule input")).toHaveValue("");
    expect(screen.getByLabelText("Template capability")).toHaveTextContent(
      "blank",
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(
      transport.post.mock.calls.every(
        ([path]) => path === `/examples/${capability}/prepare`,
      ),
    ).toBe(true);
  },
);

it("retains manual input through metadata failure and retry", async () => {
  transport.request.mockRejectedValueOnce(new Error("Failed to fetch"));
  const user = userEvent.setup();
  render(<UtilityTask tool="properties" language="en" onCreated={vi.fn()} />);
  await user.type(screen.getByLabelText("Molecule input"), "keep my input");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Example guide unavailable",
  );
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("button", { name: "Use this template" }),
  ).toBeEnabled();
  expect(screen.getByLabelText("Molecule input")).toHaveValue("keep my input");
  expect(transport.post).not.toHaveBeenCalled();
});

it("preserves input after failed preparation, then replaces only on successful retry", async () => {
  transport.post.mockRejectedValueOnce(new Error("Unavailable"));
  const user = userEvent.setup();
  render(<UtilityTask tool="states" language="en" onCreated={vi.fn()} />);
  await user.type(screen.getByLabelText("Molecule input"), "manual molecule");
  await user.click(
    await screen.findByRole("button", { name: "Use this template" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Example inputs unavailable",
  );
  expect(screen.getByLabelText("Molecule input")).toHaveValue(
    "manual molecule",
  );
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(screen.getByLabelText("Molecule input")).toHaveValue(
    "STAT6 chemistry.states",
  );
});

it.each(["admet", "brain"] satisfies MolecularUtility[])(
  "starts a blank %s task only after explicit reset of an accepted manual task",
  async (tool) => {
    const user = userEvent.setup(),
      accepted = vi.fn();
    render(<UtilityTask tool={tool} language="en" onCreated={accepted} />);
    await user.type(
      screen.getByLabelText("Molecule input"),
      "submitted molecule",
    );
    await user.click(screen.getByRole("button", { name: "Accept task" }));
    expect(accepted).toHaveBeenCalledWith({ id: "accepted" });
    await user.click(screen.getByRole("button", { name: "New task" }));
    expect(screen.getByLabelText("Molecule input")).toHaveValue("");
    expect(transport.post).not.toHaveBeenCalled();
  },
);

it("ignores an old template response after starting a new manual task", async () => {
  let finish!: (value: PreparedExample) => void;
  transport.post.mockReturnValueOnce(
    new Promise<PreparedExample>((resolve) => {
      finish = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<UtilityTask tool="admet" language="en" onCreated={vi.fn()} />);
  await user.type(
    screen.getByLabelText("Molecule input"),
    "accepted manual input",
  );
  await user.click(screen.getByRole("button", { name: "Accept task" }));
  await user.click(
    await screen.findByRole("button", { name: "Use this template" }),
  );
  await user.click(screen.getByRole("button", { name: "New task" }));
  expect(screen.getByLabelText("Molecule input")).toHaveValue("");
  await act(async () => {
    finish(prepared("admet.predict"));
  });
  expect(screen.getByLabelText("Molecule input")).toHaveValue("");
  expect(screen.getByLabelText("Template capability")).toHaveTextContent(
    "blank",
  );
  expect(
    screen.queryByRole("button", { name: "New blank task" }),
  ).not.toBeInTheDocument();
});
