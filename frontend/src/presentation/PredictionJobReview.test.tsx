import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Language, Component } from "../types";
import type { ScientificTask } from "../integrations/types";
import { entityInfo } from "../guided/entities";
import { PredictionJobReview } from "./PredictionJobReview";
import { PredictionJobSettings } from "./PredictionJobSettings";

vi.mock("./MoleculeImage", () => ({
  MoleculeImage: () => <div data-testid="native-depiction" />,
}));

const nativeDialog = ["showModal", "close"].map(
  (name) =>
    [
      name,
      Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
    ] as const,
);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  for (const [name, original] of nativeDialog) {
    if (original)
      Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.restoreAllMocks();
});

const fasta = readFileSync(
  "../src/opendde_workbench/examples/stat6/inputs/STAT6-human-P42226.fasta",
  "utf8",
);
const components: Component[] = [
  { kind: "protein", value: fasta.split(/\r?\n/).slice(1).join(""), count: 1 },
  {
    kind: "ligand",
    value: "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3",
    count: 1,
  },
];
const task: ScientificTask = {
  operation: "mol1_predict",
  name: "STAT6 · Submitted-input inspection",
  inputs: [],
  payload: { kind: "mol1", components },
  options: { device: "cpu", cpu: 2, memory_mib: 4096, seed: 101 },
};
const prepare = async (input: ScientificTask) => ({ task: input, components });

async function review(
  language: Language,
  busy = false,
  prepareInput: (
    input: ScientificTask,
    signal: AbortSignal,
  ) => ReturnType<typeof prepare> = prepare,
) {
  const close = vi.fn();
  const submit = vi.fn(async () => undefined);
  const props = {
    language,
    input: task,
    prepare: prepareInput,
    renderSettings: () => (
      <PredictionJobSettings
        language={language}
        rows={[["Network access", "Not allowed"]]}
        secondaryRows={[["Memory limit", "4096 MiB"]]}
      />
    ),
    ready: false,
    unavailable: "The model remains unavailable.",
    busy,
    error: "",
    confirm: async (send: () => Promise<unknown>) => {
      await send();
    },
    onClose: close,
    submit,
  };
  const view = render(<PredictionJobReview {...props} />);
  await screen.findByText(task.name, { exact: true });
  return {
    dialog: within(screen.getByRole("dialog")),
    close,
    submit,
    replace(input: ScientificTask) {
      view.rerender(<PredictionJobReview {...props} input={input} />);
    },
  };
}

it.each(["en", "zh"] as const)(
  "makes the first actual study sequence visible immediately in %s",
  async (language) => {
    const { dialog, submit } = await review(language);
    const name = entityInfo.protein.name[language === "zh" ? 0 : 1] + " 1";
    expect(
      dialog.getByText(name, { selector: "h3", exact: true }),
    ).toBeVisible();
    expect(dialog.getByText("847 aa", { exact: true })).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  },
);

it("blocks every dismiss action during an in-flight submission", async () => {
  const user = userEvent.setup();
  const { dialog, close, submit } = await review("en", true);
  for (const name of ["Edit setup", "Back to edit", "Close input preview"])
    expect(dialog.getByRole("button", { name })).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: "Edit setup" }));
  expect(close).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("keeps consent visible while secondary compute values are collapsed", async () => {
  const user = userEvent.setup();
  const { dialog } = await review("en");
  expect(dialog.getByText("Network access")).toBeVisible();
  expect(dialog.getByText("Not allowed")).toBeVisible();
  expect(dialog.getByText("4096 MiB")).not.toBeVisible();
  await user.click(dialog.getByText("Computation details", { exact: true }));
  expect(dialog.getByText("4096 MiB")).toBeVisible();
  expect(dialog.getByText("Not allowed")).toBeVisible();
});

it("invalidates the old view and request when prepared input identity changes", async () => {
  const user = userEvent.setup();
  const { dialog, replace, submit } = await review("en");
  await user.click(dialog.getByRole("button", { name: "Request JSON" }));
  expect(dialog.queryByRole("button", { name: "Download FASTA" })).toBeNull();
  expect(dialog.getByLabelText("X-DDE submission request")).toBeVisible();
  const next = { ...task, name: "STAT6 · Changed study" };
  replace(next);
  await screen.findByText(next.name, { exact: true });
  expect(dialog.queryByText(task.name, { exact: true })).toBeNull();
  expect(dialog.getByLabelText("X-DDE submission request")).not.toBeVisible();
  expect(dialog.getByText("847 aa", { exact: true })).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
});

it("ignores a late previous preparation after the next request is verified", async () => {
  type Snapshot = Awaited<ReturnType<typeof prepare>>;
  const pending = new Map<
    string,
    { resolve(value: Snapshot): void; signal: AbortSignal }
  >();
  const delayed = (input: ScientificTask, signal: AbortSignal) =>
    input.name === task.name
      ? prepare(input)
      : new Promise<Snapshot>((resolve) => {
          pending.set(input.name, { resolve, signal });
        });
  const { dialog, replace, submit } = await review("en", false, delayed);
  const old = { ...task, name: "STAT6 · Old pending request" };
  const next = { ...task, name: "STAT6 · New verified request" };
  replace(old);
  replace(next);
  expect(pending.get(old.name)?.signal.aborted).toBe(true);
  await act(async () => {
    pending.get(next.name)!.resolve({ task: next, components });
  });
  await act(async () => {
    pending.get(old.name)!.resolve({ task: old, components });
  });
  expect(dialog.getByText(next.name, { exact: true })).toBeVisible();
  expect(dialog.queryByText(old.name, { exact: true })).toBeNull();
  await userEvent
    .setup()
    .click(dialog.getByRole("button", { name: "Request JSON" }));
  expect(
    JSON.parse(dialog.getByLabelText("X-DDE submission request").textContent!),
  ).toEqual(next);
  expect(submit).not.toHaveBeenCalled();
});

it.each(["en", "zh"] as const)(
  "offers an identity-level edit action without submitting in %s",
  async (language) => {
    const user = userEvent.setup();
    const { dialog, close, submit } = await review(language);
    await user.click(
      dialog.getByRole("button", {
        name: language === "zh" ? "编辑设置" : "Edit setup",
      }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
    expect(submit).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "retains the selected entity disclosure across JSON and overview in %s",
  async (language) => {
    const user = userEvent.setup();
    const { dialog, submit } = await review(language);
    const name = entityInfo.ligand.name[language === "zh" ? 0 : 1] + " 2";
    await user.click(
      dialog.getByText(name, { selector: "strong", exact: true }),
    );
    expect(dialog.getByTestId("native-depiction")).toBeVisible();
    await user.click(
      dialog.getByRole("button", {
        name: language === "zh" ? "提交内容" : "Request JSON",
      }),
    );
    await user.click(
      dialog.getByRole("button", {
        name: language === "zh" ? "概览" : "Overview",
      }),
    );
    expect(dialog.getByTestId("native-depiction")).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  },
);
