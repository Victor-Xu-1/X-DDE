import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TaskForm } from "./TaskForm";
import type { Prediction } from "./types";
it("shows ready-to-use choices and keeps advanced parameters collapsed", () => {
  const { rerender } = render(
    <TaskForm language="zh" ready={false} onSubmit={vi.fn()} />,
  );
  expect(screen.getByRole("button", { name: "开始预测" })).toBeDisabled();
  expect(
    screen.getByLabelText("标准预测 · 推荐", { exact: false }),
  ).toBeChecked();
  expect(
    screen.getByText("高级设置（通常不用改）").closest("details"),
  ).not.toHaveAttribute("open");
  rerender(<TaskForm language="en" ready={true} onSubmit={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Run prediction" })).toBeEnabled();
});
it("prevents an empty input from reaching the API", async () => {
  const submit = vi.fn();
  render(<TaskForm language="zh" ready onSubmit={submit} />);
  fireEvent.submit(
    screen.getByRole("button", { name: "开始预测" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "请至少填写一个分子组分",
  );
  expect(submit).not.toHaveBeenCalled();
});
it("uses a task choice to prepare the right fields and a comparison preset", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockResolvedValue(undefined);
  render(<TaskForm language="en" ready onSubmit={submit} />);
  await user.click(screen.getByLabelText("Protein–ligand complex"));
  await user.type(
    screen.getByLabelText("One-letter amino-acid sequence"),
    "ACDE",
  );
  await user.type(screen.getByLabelText("SMILES or CCD_ identifier"), "CCO");
  await user.click(screen.getByLabelText(/Compare conformers/));
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
});
it("submits entered values once and exposes pending state", async () => {
  const user = userEvent.setup();
  let resolve!: () => void;
  const submit = vi.fn(
    (_v: Prediction, _key: string) =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<TaskForm language="en" ready onSubmit={submit} />);
  await user.type(screen.getByLabelText(/Task name/), "my experiment");
  await user.type(screen.getByLabelText("SMILES or CCD_ identifier"), "CCO");
  await user.click(screen.getByRole("button", { name: "Run prediction" }));
  expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled();
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][0]).toMatchObject({
    name: "my experiment",
    components: [{ kind: "ligand", value: "CCO", count: 1 }],
  });
  await act(async () => resolve());
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Run prediction" }),
    ).toBeEnabled(),
  );
});
it("preserves automatic name and idempotency key after uncertain network failure", async () => {
  const submit = vi.fn().mockRejectedValue(new Error("connection interrupted"));
  const { rerender } = render(
    <TaskForm language="en" ready onSubmit={submit} />,
  );
  fireEvent.change(screen.getByLabelText("SMILES or CCD_ identifier"), {
    target: { value: "CCO" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Run prediction" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "connection interrupted",
  );
  rerender(<TaskForm language="zh" ready onSubmit={submit} />);
  fireEvent.submit(
    screen.getByRole("button", { name: "开始预测" }).closest("form")!,
  );
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[0][1]).toBe(submit.mock.calls[1][1]);
  expect(submit.mock.calls[0][0].name).toBe(submit.mock.calls[1][0].name);
});
