import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import {
  InputActionScope,
  useInputActionScope,
} from "../guided/InputActionScope";
import { TaskPresentationContext } from "../guided/TaskPresentation";
import { defaults } from "./generated";
import type { MoleculeRef } from "../research/types";
import type { Job } from "../types";
import { StatePreparationHandoff } from "./StatePreparationHandoff";

vi.mock("./StateForm", async () => {
  const { useInputTaskSubmit } = await import("../guided/useInputTaskSubmit");
  return {
    StateForm: ({
      onCreated,
      initialMolecule,
    }: {
      onCreated(job: Job): void;
      initialMolecule: MoleculeRef;
    }) => {
      const run = useInputTaskSubmit(onCreated);
      return (
        <button
          type="button"
          onClick={() =>
            void run.submit({
              operation: "molecular_states",
              molecule: initialMolecule,
              options: { ...defaults, force_field: "MMFF94s" },
              name: "test",
            })
          }
        >
          Submit follow-up
        </button>
      );
    },
  };
});
vi.mock("../utilities/TaskBackendControl", () => ({
  FollowupBackendControl: () => null,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function ParentStatus() {
  return <p role="status">{useInputActionScope()?.action ?? "idle"}</p>;
}

it.each([false, true])(
  "protects the receipt with inherited scope %s",
  async (inherited) => {
    let resolve!: (job: Job) => void;
    const queued = { id: "accepted" } as Job;
    const send = vi.spyOn(api, "submit").mockImplementation(
      () =>
        new Promise<Job>((done) => {
          resolve = done;
        }),
    );
    const onBack = vi.fn();
    const onCreated = vi.fn();
    const form = (
      <StatePreparationHandoff
        input={{
          reference: {
            asset_id: "original",
            sha256: "a".repeat(64),
            record: 0,
            conformer: 0,
          },
          label: "Input molecule #4",
        }}
        language="en"
        backLabel="Back to results"
        onBack={onBack}
        onCreated={onCreated}
      />
    );
    render(
      <TaskPresentationContext.Provider value={{ layout: "single" }}>
        {inherited ? (
          <InputActionScope>
            <ParentStatus />
            {form}
          </InputActionScope>
        ) : (
          form
        )}
      </TaskPresentationContext.Provider>,
    );
    const user = userEvent.setup();
    expect(
      screen.getByRole("heading", { name: "Molecule preparation" }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Submit follow-up" }));
    expect(send).toHaveBeenCalledOnce();
    const back = screen.getByRole("button", { name: "Back to results" });
    expect(back).toBeDisabled();
    if (inherited)
      expect(screen.getByRole("status")).toHaveTextContent("submission");
    await user.click(back);
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => resolve(queued));
    await waitFor(() => expect(back).toBeEnabled());
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(queued);
    await user.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  },
);
