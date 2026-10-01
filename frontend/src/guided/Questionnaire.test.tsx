import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { Questionnaire } from "./Questionnaire";
import type { Job } from "../types";
afterEach(cleanup);
function Form({
  onSubmit,
  ready = true,
}: {
  onSubmit(): Promise<Job | undefined>;
  ready?: boolean;
}) {
  const [input, setInput] = useState("");
  return (
    <Questionnaire
      language="en"
      busy={false}
      error=""
      ready={ready}
      unavailable="Runtime missing"
      submitLabel="Start actual task"
      onSubmit={onSubmit}
      steps={[
        {
          title: "Choose input",
          valid: Boolean(input),
          content: (
            <label>
              Input
              <input value={input} onChange={(e) => setInput(e.target.value)} />
            </label>
          ),
        },
        { title: "Context", valid: true, content: <p>Required context</p> },
        {
          title: "Settings",
          valid: true,
          content: <p>Recommended settings</p>,
        },
        {
          title: "Review",
          valid: true,
          content: <p>Reviewed input: {input}</p>,
        },
      ]}
    />
  );
}
it("requires inputs, retains back navigation and never submits before the review step", async () => {
  const submit = vi.fn().mockResolvedValue({ id: "actual-job" } as Job),
    user = userEvent.setup();
  const { container } = render(<Form onSubmit={submit} />);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.queryByText("Required context")).not.toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: "Input" }),
    "saved molecule",
  );
  fireEvent.submit(container.querySelector("form")!);
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "2. Context" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("textbox", { name: "Input" })).toHaveValue(
    "saved molecule",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Start actual task" }));
  expect(
    await screen.findByRole("heading", { name: "5. View results" }),
  ).toBeVisible();
  expect(submit).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("link", { name: "Open task progress and results" }),
  ).toHaveAttribute("href", "/#task=actual-job");
});
it("blocks start for missing runtime without discarding prepared input", async () => {
  const submit = vi.fn(),
    user = userEvent.setup();
  render(<Form onSubmit={submit} ready={false} />);
  await user.type(
    screen.getByRole("textbox", { name: "Input" }),
    "saved molecule",
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "Start actual task" }),
  ).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Runtime missing");
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("textbox", { name: "Input" })).toHaveValue(
    "saved molecule",
  );
  expect(submit).not.toHaveBeenCalled();
});
it("guards rapid duplicate submit and reports unexpected submission errors", async () => {
  let reject!: (error: Error) => void;
  const submit = vi.fn(
      () =>
        new Promise<Job | undefined>((_, r) => {
          reject = r;
        }),
    ),
    user = userEvent.setup();
  const { container } = render(<Form onSubmit={submit} />);
  await user.type(
    screen.getByRole("textbox", { name: "Input" }),
    "saved molecule",
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.submit(container.querySelector("form")!);
  fireEvent.submit(container.querySelector("form")!);
  expect(submit).toHaveBeenCalledTimes(1);
  reject(new Error("Service unavailable"));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable"),
  );
});
