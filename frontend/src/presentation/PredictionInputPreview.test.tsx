import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PreviewComponent } from "./PredictionEntityPreview";
import { PredictionSetup } from "./PredictionSetup";

vi.mock("./MoleculeImage", () => ({
  MoleculeImage: ({ source }: { source: unknown }) => (
    <div data-testid="native-drawing" data-source={JSON.stringify(source)} />
  ),
}));
const original = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
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
afterEach(cleanup);
afterAll(() => {
  for (const [name, value] of [
    ["showModal", original],
    ["close", originalClose],
  ] as const)
    if (value) Object.defineProperty(HTMLDialogElement.prototype, name, value);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
});
const base = {
  language: "en" as const,
  model: "Mol-1",
  seeds: [101, 202],
  samples: 5,
  valid: true,
};
function Form({
  items,
  language = "en",
  enabled = true,
}: {
  items: PreviewComponent[];
  language?: "zh" | "en";
  enabled?: boolean;
}) {
  return (
    <PredictionSetup
      {...base}
      language={language}
      components={items}
      enabled={enabled}
    >
      <input aria-label="Actual task input" />
    </PredictionSetup>
  );
}

it.each(["en", "zh"] as const)(
  "opens a read-only %s overview and returns focus to editing",
  (language) => {
    render(
      <Form
        language={language}
        items={[{ kind: "protein", value: "ACDEFGHIK", count: 2 }]}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: language === "zh" ? "预览输入" : "Preview inputs",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: language === "zh" ? "预览研究输入" : "Preview study inputs",
    });
    expect(dialog).toHaveTextContent("Mol-1");
    expect(dialog).toHaveTextContent("101, 202");
    expect(
      within(dialog).queryByRole("button", { name: /submit|提交/i }),
    ).toBeNull();
    expect(
      within(dialog).getByText(
        language === "zh" ? "尚未提交" : "Not submitted",
      ),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: language === "zh" ? "返回编辑" : "Back to edit",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText("Actual task input")).toHaveValue("");
  },
);

it("uses current inputs while open, preserves selected-file priority and drops removed entities", () => {
  const view = render(
    <Form items={[{ kind: "ligand", value: "old-input", count: 1 }]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview inputs" }));
  view.rerender(
    <Form
      items={[
        {
          kind: "ligand",
          value: "stale-input",
          ligand_file: "exact-file",
          count: 1,
        },
      ]}
    />,
  );
  const dialog = screen.getByRole("dialog");
  expect(dialog).not.toHaveTextContent("stale-input");
  expect(dialog).not.toHaveTextContent("old-input");
  expect(
    within(dialog).getByRole("link", {
      name: "Download selected structure input",
    }),
  ).toHaveAttribute("href", "/api/assets/exact-file");
  expect(within(dialog).getByTestId("native-drawing")).toHaveAttribute(
    "data-source",
    '{"url":"/api/assets/exact-file"}',
  );
  view.rerender(<Form items={[]} />);
  expect(within(dialog).queryByTestId("native-drawing")).toBeNull();
  expect(within(dialog).queryByRole("link")).toBeNull();
  expect(dialog).toHaveTextContent("No study inputs yet");
});

it("keeps long sequence inspection bounded and updates positions after an input changes", () => {
  const view = render(
    <Form
      items={[{ kind: "protein", value: "ACDEFGHIKL".repeat(100), count: 1 }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview inputs" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelectorAll("[data-position]")).toHaveLength(600);
  fireEvent.click(
    within(dialog).getByRole("button", { name: /^Next segment$/ }),
  );
  expect(dialog).toHaveTextContent("601–1000 / 1000");
  view.rerender(<Form items={[{ kind: "rna", value: "AUGC", count: 1 }]} />);
  expect(dialog.querySelectorAll("[data-position]")).toHaveLength(4);
  expect(dialog).toHaveTextContent("4 nt");
  expect(dialog).not.toHaveTextContent("601–1000");
});

it("retains multiple FASTA records for correction and does not invent a sequence or a CCD drawing", () => {
  render(
    <Form
      items={[
        { kind: "protein", value: ">first\nACDE\n>second\nFGHI", count: 1 },
        { kind: "ligand", value: "CCD_NAG", count: 1 },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview inputs" }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByText(">first\nACDE\n>second\nFGHI", {
      normalizer: (value) => value,
    }),
  ).toBeVisible();
  expect(dialog.querySelectorAll("[data-position]")).toHaveLength(0);
  expect(dialog).toHaveTextContent("CCD_NAG");
  expect(within(dialog).queryByTestId("native-drawing")).toBeNull();
});

it("handles Escape and removes the preview when the operation leaves prediction mode", () => {
  const view = render(<Form items={[]} />);
  const trigger = screen.getByRole("button", { name: "Preview inputs" });
  fireEvent.click(trigger);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  view.rerender(<Form items={[]} enabled={false} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Preview inputs" })).toBeNull();
  expect(screen.getByLabelText("Actual task input")).toBeVisible();
  view.rerender(<Form items={[]} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("uses the shared single-FASTA normalization and retains a nonzero selected molecular record", () => {
  render(
    <Form
      items={[
        { kind: "protein", value: ">STAT6 input\nacde\nFGHI", count: 1 },
        {
          kind: "ligand",
          value: "stale",
          ligand_file: "library-file",
          ligand_record: 7,
          count: 1,
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview inputs" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelectorAll("[data-position]")).toHaveLength(8);
  fireEvent.click(
    within(dialog).getByText("Small molecule / ligand 2", { exact: true }),
  );
  expect(within(dialog).getByTestId("native-drawing")).toHaveAttribute(
    "data-source",
    '{"url":"/api/assets/library-file","record":7}',
  );
  expect(dialog).toHaveTextContent("Molecular record in file: 8");
  expect(dialog).not.toHaveTextContent("stale");
});
