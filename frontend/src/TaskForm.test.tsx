import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TaskForm } from "./TaskForm";
import type { Job, Prediction } from "./types";
vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return {
    ...actual,
    request: vi.fn((path: string, options?: RequestInit) => {
      if (path === "/examples/predict")
        return Promise.resolve({
          module: {
            capability_id: "predict",
            case_id: "brd4-jq1",
            revision: 1,
          },
          case: {
            id: "brd4-jq1",
            revision: 1,
            label: ["BRD4–JQ1", "BRD4–JQ1"],
            description: ["公开复合物", "Public complex"],
            sources: [],
          },
          files: [],
          pin: null,
          computed_result_available: false,
        });
      return actual.request(path, options);
    }),
  };
});
afterEach(cleanup);
it("localizes material guidance without replacing the user's sequence or stereochemistry", async () => {
  const submit = vi.fn(),
    user = userEvent.setup();
  const { rerender } = render(
    <TaskForm language="en" ready={false} onSubmit={submit} />,
  );
  await user.click(screen.getByRole("button", { name: /^Next$/ }));
  const sequence = screen.getByLabelText("One-letter amino-acid sequence"),
    ligand = screen.getByLabelText("SMILES or CCD_ identifier");
  expect(sequence).toHaveAttribute(
    "placeholder",
    "Paste the target protein sequence or one FASTA record",
  );
  expect(ligand).toHaveAttribute(
    "placeholder",
    "Paste SMILES or a CCD_ component identifier",
  );
  await user.type(sequence, "MSSATQQK");
  await user.type(ligand, "N[C@@H](C)C(=O)O");
  rerender(<TaskForm language="zh" ready={false} onSubmit={submit} />);
  expect(screen.getByLabelText("单字母氨基酸序列")).toHaveValue("MSSATQQK");
  expect(screen.getByLabelText("SMILES 或 CCD_ 编号")).toHaveValue(
    "N[C@@H](C)C(=O)O",
  );
  expect(screen.getByLabelText("SMILES 或 CCD_ 编号")).toHaveAttribute(
    "placeholder",
    "粘贴 SMILES 或 CCD_组分编号",
  );
  await user.click(
    screen.getByRole("button", { name: "小分子 / 配体输入说明" }),
  );
  expect(screen.getByRole("tooltip")).not.toHaveTextContent(
    /CCO|乙醇|ethanol/i,
  );
  expect(submit).not.toHaveBeenCalled();
});
it("offers recommended choices, retains prepared input and blocks unavailable prediction at review", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <TaskForm language="zh" ready={false} onSubmit={vi.fn()} />,
  );
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
  await user.type(screen.getByLabelText("单字母氨基酸序列"), "ACDE");
  await user.type(screen.getByLabelText("SMILES 或 CCD_ 编号"), "CCO");
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(
    screen.getByLabelText("标准预测 · 推荐", { exact: false }),
  ).toBeChecked();
  expect(screen.queryByLabelText("随机种子")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("button", { name: "开始预测" })).toBeDisabled();
  rerender(<TaskForm language="en" ready={true} onSubmit={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Run prediction" })).toBeEnabled();
});
it("prevents an empty input from reaching the API", async () => {
  const user = userEvent.setup(),
    submit = vi.fn();
  const { container } = render(
    <TaskForm language="en" ready onSubmit={submit} />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.submit(container.querySelector("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Check step 2");
  expect(submit).not.toHaveBeenCalled();
});
it("keeps native prediction components and comparison preset while submitting only after review", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockResolvedValue({ id: "predicted" } as Job);
  render(<TaskForm language="en" ready onSubmit={submit} />);
  await user.click(screen.getByLabelText("Protein–ligand complex"));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(
    screen.getByLabelText("One-letter amino-acid sequence"),
    "ACDE",
  );
  await user.type(screen.getByLabelText("SMILES or CCD_ identifier"), "CCO");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByLabelText(/Compare conformers/));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Run prediction" }));
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][0]).toMatchObject({
    components: [
      { kind: "protein", value: "ACDE" },
      { kind: "ligand", value: "CCO" },
    ],
    parameters: {
      samples: 3,
      steps: 200,
      cycles: 10,
      dtype: "bf16",
      model: "standard",
    },
  });
  expect(submit.mock.calls[0][0].name).toMatch(/^Protein–ligand complex/);
  expect(
    await screen.findByRole("link", { name: "Open task progress and results" }),
  ).toHaveAttribute("href", "/#task=predicted");
});
it("submits native entered values once and retains the pending state until the actual response", async () => {
  const user = userEvent.setup();
  let resolve!: (job: Job) => void;
  const submit = vi.fn(
    (_v: Prediction, _key: string) =>
      new Promise<Job>((done) => {
        resolve = done;
      }),
  );
  render(<TaskForm language="en" ready onSubmit={submit} />);
  await user.click(screen.getByLabelText("Small-molecule structure"));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(screen.getByLabelText("SMILES or CCD_ identifier"), "CCO");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(screen.getByLabelText(/Task name/), "my experiment");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Run prediction" }));
  expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled();
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][0]).toMatchObject({
    name: "my experiment",
    components: [{ kind: "ligand", value: "CCO", count: 1 }],
  });
  await act(async () => resolve({ id: "pending-response" } as Job));
  expect(
    await screen.findByRole("heading", { name: "5. View results" }),
  ).toBeVisible();
});
it("preserves automatic name and idempotency key after uncertain failure and language changes", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockRejectedValue(new Error("connection interrupted"));
  const { rerender } = render(
    <TaskForm language="en" ready onSubmit={submit} />,
  );
  await user.click(screen.getByLabelText("Small-molecule structure"));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(screen.getByLabelText("SMILES or CCD_ identifier"), "CCO");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Run prediction" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "connection interrupted",
  );
  rerender(<TaskForm language="zh" ready onSubmit={submit} />);
  await user.click(screen.getByRole("button", { name: "开始预测" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[0][1]).toBe(submit.mock.calls[1][1]);
  expect(submit.mock.calls[0][0].name).toBe(submit.mock.calls[1][0].name);
});
