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
import { GuidedSteps, Questionnaire } from "./Questionnaire";
import type { Job } from "../types";

it("opens a verified existing result without running the questionnaire or submitting again", () => {
  const submit = vi.fn();
  render(
    <GuidedSteps
      language="en"
      steps={[
        {
          title: "Inputs",
          valid: true,
          content: <input aria-label="Protocol input" />,
        },
        { title: "Choices", valid: true, content: <p>Choices</p> },
        { title: "Settings", valid: true, content: <p>Settings</p> },
        { title: "Review", valid: true, content: <p>Review</p> },
      ]}
      busy={false}
      error=""
      ready={false}
      submitLabel="Launch"
      onSubmit={submit}
      initialResult={{ id: "retained-record" }}
      renderResult={(value) => <p>Verified result {value.id}</p>}
    />,
  );
  expect(screen.getByText("Verified result retained-record")).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Protocol input" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
import { JsonEditor } from "../operations/ScientificInputs";
afterEach(cleanup);
it("keeps step-specific controls disabled during submission and retains their state on navigation", async () => {
  const changeMode = vi.fn(),
    user = userEvent.setup();
  const input = {
    language: "en" as const,
    busy: false,
    error: "",
    ready: true,
    submitLabel: "Launch",
    onSubmit: vi.fn(),
    steps: [
      {
        title: "Inputs",
        valid: true,
        content: <p>Input questions</p>,
        actions: (
          <button type="button" onClick={changeMode}>
            Expert mode
          </button>
        ),
      },
      { title: "Context", valid: true, content: <p>Context questions</p> },
      { title: "Settings", valid: true, content: <p>Setting questions</p> },
      { title: "Review", valid: true, content: <p>Reviewed inputs</p> },
    ] as const,
  };
  const { rerender } = render(<Questionnaire {...input} />);
  await user.click(screen.getByRole("button", { name: "Expert mode" }));
  expect(changeMode).toHaveBeenCalledOnce();
  rerender(<Questionnaire {...input} busy />);
  expect(screen.getByRole("button", { name: "Expert mode" })).toBeDisabled();
  rerender(<Questionnaire {...input} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByRole("button", { name: "Expert mode" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "Expert mode" })).toBeEnabled();
  expect(changeMode).toHaveBeenCalledOnce();
  expect(input.onSubmit).not.toHaveBeenCalled();
});
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

it("blocks jumping past an invalid retained expert JSON draft and recovers without sending stale values", async () => {
  const submit = vi.fn().mockResolvedValue({ id: "validated-draft" } as Job),
    user = userEvent.setup();
  const { container } = render(
    <Questionnaire
      language="en"
      busy={false}
      error=""
      ready
      submitLabel="Start actual task"
      onSubmit={submit}
      steps={[
        { title: "Choose input", valid: true, content: <p>Selected input</p> },
        { title: "Context", valid: true, content: <p>Known context</p> },
        {
          title: "Settings",
          valid: true,
          content: (
            <JsonEditor
              label="Native settings"
              value={{ cpu: 4 }}
              onChange={() => {}}
            />
          ),
        },
        { title: "Review", valid: true, content: <p>Actual input review</p> },
      ]}
    />,
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.clear(screen.getByRole("textbox", { name: "Native settings" }));
  await user.type(
    screen.getByRole("textbox", { name: "Native settings" }),
    "malformed",
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Step 4: Review" }));
  expect(screen.getByRole("heading", { name: "3. Settings" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Native settings" })).toHaveValue(
    "malformed",
  );
  expect(submit).not.toHaveBeenCalled();
  expect(container.querySelectorAll("fieldset[disabled]")).toHaveLength(3);
  await user.clear(screen.getByRole("textbox", { name: "Native settings" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Native settings" }), {
    target: { value: "{}" },
  });
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Start actual task" }));
  expect(submit).toHaveBeenCalledTimes(1);
});
it("rechecks native range constraints at final submission when retained settings change", async () => {
  const submit = vi.fn(),
    user = userEvent.setup();
  const view = (value: number) => (
    <Questionnaire
      language="en"
      busy={false}
      error=""
      ready
      submitLabel="Start actual task"
      onSubmit={submit}
      steps={[
        { title: "Choose input", valid: true, content: <p>Selected input</p> },
        { title: "Context", valid: true, content: <p>Known context</p> },
        {
          title: "Settings",
          valid: true,
          content: (
            <label>
              CPU
              <input
                type="number"
                required
                min={1}
                max={32}
                value={value}
                onChange={() => {}}
              />
            </label>
          ),
        },
        { title: "Review", valid: true, content: <p>Actual input review</p> },
      ]}
    />
  );
  const { rerender } = render(view(4));
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  rerender(view(0));
  await user.click(screen.getByRole("button", { name: "Start actual task" }));
  expect(screen.getByRole("heading", { name: "3. Settings" })).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
});

import { TemplatePreviewContext } from "../examples/context";
it("an embedded result preview cannot submit an additional scientific task", async () => {
  const submit = vi.fn(),
    user = userEvent.setup();
  const { container } = render(
    <TemplatePreviewContext.Provider value={true}>
      <Form onSubmit={submit} />
    </TemplatePreviewContext.Provider>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Input" }),
    "New compound input",
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "Start actual task" }),
  ).toBeDisabled();
  fireEvent.submit(container.querySelector("form")!);
  expect(submit).not.toHaveBeenCalled();
});
