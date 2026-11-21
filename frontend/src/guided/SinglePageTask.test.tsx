import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Questionnaire } from "./Questionnaire";
import { TaskPresentationContext } from "./TaskPresentation";
import type { Job } from "../types";

afterEach(cleanup);
function Composer({
  submit,
  ready = true,
  onRecheck,
}: {
  submit(): Promise<Job | undefined>;
  ready?: boolean;
  onRecheck?(): void;
}) {
  const [value, setValue] = useState("");
  return (
    <TaskPresentationContext.Provider
      value={{
        layout: "single",
        renderResult: (job) => <p>Native result {job.id}</p>,
      }}
    >
      <button type="button" onClick={() => setValue("Recognized screenshot")}>
        Apply recognized structure
      </button>
      <Questionnaire
        language="en"
        inputKey={value}
        ready={ready}
        busy={false}
        error=""
        unavailable="Service is off"
        onCheckEnvironment={onRecheck}
        submitLabel="Calculate"
        onSubmit={submit}
        steps={[
          {
            title: "Input",
            valid: Boolean(value),
            content: (
              <input
                aria-label="Molecule"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            ),
          },
          {
            title: "Settings",
            inline: "options",
            valid: true,
            content: (
              <input
                aria-label="Cutoff"
                type="number"
                min={0}
                max={1}
                step="any"
                defaultValue="0.5"
              />
            ),
          },
          {
            title: "Review",
            inline: "preview",
            valid: true,
            content: <p>Actual structure {value}</p>,
          },
        ]}
      />
    </TaskPresentationContext.Provider>
  );
}

it("runs once from the input page and displays the accepted result without navigation", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockResolvedValue({ id: "real-task" });
  render(<Composer submit={submit} />);
  expect(screen.queryByRole("navigation", { name: "Task steps" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  expect(screen.getByRole("button", { name: "Calculate" })).toBeDisabled();
  await user.type(screen.getByLabelText("Molecule"), "STAT6 warhead");
  expect(screen.getByText("Actual structure STAT6 warhead")).toBeVisible();
  expect(screen.getByLabelText("Cutoff")).not.toBeVisible();
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Calculate" }));
  expect(await screen.findByText("Native result real-task")).toBeVisible();
  expect(screen.getByLabelText("Molecule")).toHaveValue("STAT6 warhead");
  await user.type(screen.getByLabelText("Molecule"), " edited");
  expect(screen.queryByText("Native result real-task")).toBeNull();
  expect(submit).toHaveBeenCalledOnce();
});

it("validates closed optional controls and reveals an invalid setting before submission", async () => {
  const user = userEvent.setup(),
    submit = vi.fn();
  render(<Composer submit={submit} />);
  await user.type(screen.getByLabelText("Molecule"), "STAT6");
  fireEvent.change(screen.getByLabelText("Cutoff"), { target: { value: "2" } });
  await user.click(screen.getByRole("button", { name: "Calculate" }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the required inputs",
  );
  expect(screen.getByLabelText("Cutoff")).toBeVisible();
  expect(screen.getByLabelText("Cutoff")).toHaveFocus();
});

it("rejects duplicate sends and preserves input after a failed request", async () => {
  let reject!: (error: Error) => void;
  const submit = vi.fn(
      () =>
        new Promise<Job>((_, fail) => {
          reject = fail;
        }),
    ),
    user = userEvent.setup();
  const { container } = render(<Composer submit={submit} />);
  await user.type(screen.getByLabelText("Molecule"), "keep STAT6");
  await act(async () => {
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);
  });
  expect(submit).toHaveBeenCalledOnce();
  await act(async () => {
    reject(new Error("Service remains off"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Service remains off");
  expect(screen.getByLabelText("Molecule")).toHaveValue("keep STAT6");
});

it("never enables or submits an unavailable service", async () => {
  const user = userEvent.setup(),
    submit = vi.fn();
  render(<Composer submit={submit} ready={false} />);
  await user.type(screen.getByLabelText("Molecule"), "STAT6");
  expect(screen.getByText("Tool is not ready")).toBeVisible();
  expect(screen.getByText("Service is off")).not.toBeVisible();
  expect(screen.getByRole("button", { name: "Calculate" })).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});

it("opens readiness details and retries without submitting or losing the molecule", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  const recheck = vi.fn();
  const { rerender } = render(
    <Composer submit={submit} ready={false} onRecheck={recheck} />,
  );
  const molecule = screen.getByLabelText("Molecule");
  await user.type(molecule, "STAT6");
  const summary = screen.getByText("Tool is not ready").closest("summary")!;
  expect(recheck).not.toHaveBeenCalled();
  await user.click(summary);
  expect(screen.getByText("Service is off")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Check environment again" }),
  );
  expect(recheck).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
  expect(molecule).toHaveValue("STAT6");
  expect(screen.getByRole("button", { name: "Calculate" })).toBeDisabled();
  rerender(<Composer submit={submit} ready onRecheck={recheck} />);
  expect(screen.queryByText("Tool is not ready")).toBeNull();
  expect(screen.getByRole("button", { name: "Calculate" })).toBeEnabled();
  expect(molecule).toHaveValue("STAT6");
});

it("invalidates the prior output when an asynchronous image callback replaces the input", async () => {
  const user = userEvent.setup(),
    submit = vi.fn().mockResolvedValue({ id: "original" });
  render(<Composer submit={submit} />);
  await user.type(screen.getByLabelText("Molecule"), "Original structure");
  await user.click(screen.getByRole("button", { name: "Calculate" }));
  expect(await screen.findByText("Native result original")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Apply recognized structure" }),
  );
  expect(screen.getByLabelText("Molecule")).toHaveValue(
    "Recognized screenshot",
  );
  expect(screen.queryByText("Native result original")).toBeNull();
  expect(submit).toHaveBeenCalledOnce();
});
