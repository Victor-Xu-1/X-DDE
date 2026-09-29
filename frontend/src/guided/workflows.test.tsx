import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TaskForm } from "../TaskForm";
import { componentsFor } from "./presets";
import { defaults, prediction, validate } from "../form-model";
it("prepares distinct protein chains and automatically dispatches antibody tasks to ABAG", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockResolvedValue(undefined);
  render(<TaskForm language="zh" ready abagAvailable onSubmit={submit} />);
  await user.click(screen.getByLabelText("抗体–抗原复合物"));
  const fields = screen.getAllByLabelText("单字母氨基酸序列");
  await user.type(fields[0], "ACDE");
  await user.type(fields[1], "FGHI");
  await user.click(screen.getByLabelText("多构象比较"));
  await user.click(screen.getByRole("button", { name: "开始预测" }));
  expect(submit.mock.calls[0][0]).toMatchObject({
    components: [
      { kind: "protein", value: "ACDE" },
      { kind: "protein", value: "FGHI" },
    ],
    parameters: { model: "abag", samples: 3 },
  });
  expect(
    componentsFor("protein-complex", [
      { kind: "protein", value: "ACDE", count: 1 },
    ])[1].value,
  ).toBe("");
});
it("does not advertise an unavailable antibody model", () => {
  render(<TaskForm language="en" ready onSubmit={vi.fn()} />);
  expect(
    screen.queryByLabelText("Antibody–antigen complex"),
  ).not.toBeInTheDocument();
});
it("retains edits across expert/guided mode and workflow switches", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockResolvedValue(undefined);
  render(<TaskForm language="zh" ready onSubmit={submit} />);
  await user.click(screen.getByLabelText("DNA / RNA 结构"));
  await user.type(screen.getByLabelText("RNA 序列"), "GUAC");
  await user.click(screen.getByRole("button", { name: "专家微调" }));
  fireEvent.change(screen.getByLabelText("扩散步数"), {
    target: { value: "80" },
  });
  await user.click(screen.getByRole("button", { name: "简易模式" }));
  expect(screen.queryByLabelText("扩散步数")).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("蛋白结构"));
  await user.click(screen.getByLabelText("DNA / RNA 结构"));
  expect(screen.getByLabelText("RNA 序列")).toHaveValue("GUAC");
  await user.click(screen.getByRole("button", { name: "开始预测" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({
    components: [{ kind: "rna", value: "GUAC" }],
    parameters: { steps: 80, model: "standard" },
  });
});
it("validates nucleic alphabets without silently converting T/U and preserves ligand case", () => {
  expect(validate("RNA", [{ kind: "rna", value: "ATGC", count: 1 }])).toBe(
    "invalidNucleic",
  );
  expect(validate("DNA", [{ kind: "dna", value: "AUGC", count: 1 }])).toBe(
    "invalidNucleic",
  );
  expect(
    validate("ion", [{ kind: "ion", value: "file:///etc/passwd", count: 1 }]),
  ).toBe("invalidIon");
  const result = prediction(
    "nucleic",
    [
      { kind: "dna", value: ">strand\n gat c", count: 1 },
      { kind: "rna", value: "gua c", count: 1 },
      { kind: "ion", value: "mg", count: 1 },
    ],
    defaults,
  );
  expect(result.components.map((x) => x.value)).toEqual(["GATC", "GUAC", "MG"]);
});
it("honors an explicit expert checkpoint override instead of silently forcing ABAG", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockResolvedValue(undefined);
  render(<TaskForm language="en" ready abagAvailable onSubmit={submit} />);
  await user.click(screen.getByLabelText("Antibody–antigen complex"));
  await user.click(screen.getByRole("button", { name: "Expert mode" }));
  await user.selectOptions(
    screen.getByLabelText("Structure model"),
    "standard",
  );
  const fields = screen.getAllByLabelText("One-letter amino-acid sequence");
  await user.type(fields[0], "ACDE");
  await user.type(fields[1], "FGHI");
  await user.click(screen.getByRole("button", { name: "Run prediction" }));
  expect(submit.mock.calls[0][0].parameters.model).toBe("standard");
});
