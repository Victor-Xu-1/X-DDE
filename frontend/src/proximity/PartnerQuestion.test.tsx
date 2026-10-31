import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { defaults } from "./generated";
import { PartnerQuestion } from "./PartnerQuestion";
import { useProximityDraft } from "./useProximityDraft";

const verification = vi.hoisted(() => ({
  pending: null as Promise<MoleculeRef> | null,
}));
const ref = (asset_id: string, record = 0): MoleculeRef => ({
  asset_id,
  sha256: "a".repeat(64),
  record,
  conformer: 0,
});
vi.mock("../examples/context", () => ({
  useExample: () => null,
  useExampleTask: () => ({
    inputs: ["ligand", "partner_a", "partner_b", "arm_a", "arm_b"].map(
      (role) => ({
        role,
        source: {
          asset_id: role,
          sha256: "a".repeat(64),
          record: 0,
          conformer: 0,
        },
      }),
    ),
    payload: {
      ...defaults,
      partner_a_chain: "A",
      partner_b_chain: "B",
      arm_a_map: [],
      arm_b_map: [],
    },
  }),
}));
// The real selector clears on choose, resolves metadata asynchronously, and
// publishes a new reference only after verification. Its contract is separately
// checked by the real ReferencePicker consumer suite in this same focused gate.
vi.mock("./PartnerStep", () => ({
  PartnerStep: ({
    source,
    onSource,
    arm,
    onArm,
  }: {
    source: MoleculeRef | null;
    onSource(v: MoleculeRef | null): void;
    arm: MoleculeRef | null;
    onArm(v: MoleculeRef | null): void;
  }) => (
    <>
      <button
        onClick={() => {
          if (source) onSource({ ...source, version_id: "next-protein" });
        }}
      >
        Choose protein version
      </button>
      <button
        onClick={() => {
          onArm(null);
          void verification.pending?.then(onArm, () => {});
        }}
      >
        Verify another fragment
      </button>
      <button
        onClick={() => {
          if (arm) onArm({ ...arm, record: arm.record + 1 });
        }}
      >
        Choose next record
      </button>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  verification.pending = null;
});

function Study({ language, side }: { language: Language; side: "a" | "b" }) {
  const draft = useProximityDraft(language);
  return (
    <>
      <button onClick={() => draft.onLigand(null)}>Clear full molecule</button>
      <button
        onClick={() => (side === "a" ? draft.onFirst : draft.onSecond)(null)}
      >
        Clear protein
      </button>
      <PartnerQuestion language={language} side={side} draft={draft} />
      <output aria-label="Exact draft">
        {JSON.stringify({
          arm: side === "a" ? draft.armA : draft.armB,
          map: side === "a" ? draft.payload.arm_a_map : draft.payload.arm_b_map,
          ready: side === "a" ? draft.firstReady : draft.secondReady,
        })}
      </output>
    </>
  );
}
const label = (language: Language) =>
  language === "en"
    ? "Expert: explicit atom correspondence"
    : "专家：指定原子对应关系";
const field = (language: Language) =>
  screen.getByPlaceholderText(
    language === "en"
      ? "Empty: unique chemical correspondence"
      : "留空：唯一化学对应",
  );

it.each(["en", "zh"] as const)(
  "does not accept a disappearing map during fragment verification in %s",
  async (language) => {
    for (const side of ["a", "b"] as const) {
      let resolve!: (value: MoleculeRef) => void;
      verification.pending = new Promise((r) => {
        resolve = r;
      });
      const view = render(<Study language={language} side={side} />);
      fireEvent.click(screen.getByText(label(language), { exact: true }));
      fireEvent.change(field(language), { target: { value: "2, 4, 6" } });
      expect(screen.getByLabelText("Exact draft")).toHaveTextContent(
        '"map":[1,3,5]',
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Verify another fragment" }),
      );
      expect(screen.queryByText(label(language), { exact: true })).toBeNull();
      expect(screen.getByLabelText("Exact draft")).toHaveTextContent(
        '"arm":null',
      );
      await act(async () => resolve(ref("verified-new-arm", 15)));
      fireEvent.click(screen.getByText(label(language), { exact: true }));
      expect(field(language)).toHaveValue("");
      fireEvent.change(field(language), { target: { value: "8, 9, 10" } });
      view.rerender(
        <Study language={language === "en" ? "zh" : "en"} side={side} />,
      );
      expect(field(language === "en" ? "zh" : "en")).toHaveValue("8, 9, 10");
      expect(screen.getByLabelText("Exact draft")).toHaveTextContent(
        '"record":15',
      );
      expect(screen.getByLabelText("Exact draft")).toHaveTextContent(
        '"map":[7,8,9]',
      );
      view.unmount();
    }
  },
);

it.each(["en", "zh"] as const)(
  "does not expose atom mapping when the full molecule or protein is missing in %s",
  (language) => {
    for (const name of ["Clear full molecule", "Clear protein"]) {
      const view = render(<Study language={language} side="a" />);
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.queryByText(label(language), { exact: true })).toBeNull();
      view.unmount();
    }
  },
);

it.each(["en", "zh"] as const)(
  "resets invalid correspondence when changing records of the same SDF in %s",
  (language) => {
    render(<Study language={language} side="b" />);
    fireEvent.click(screen.getByText(label(language), { exact: true }));
    fireEvent.change(field(language), { target: { value: "1, 1, 2" } });
    expect(field(language)).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Choose next record" }));
    const summary = screen.getByText(label(language), { exact: true });
    if (!field(language).closest("details")?.hasAttribute("open"))
      fireEvent.click(summary);
    expect(field(language)).toHaveValue("");
    expect(field(language)).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Exact draft")).toHaveTextContent(
      '"record":1',
    );
  },
);

it("keeps the editor unavailable after failed verification and a later missing molecule", async () => {
  let reject!: (reason: Error) => void;
  verification.pending = new Promise((_, r) => {
    reject = r;
  });
  render(<Study language="en" side="a" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Verify another fragment" }),
  );
  await act(async () => reject(new Error("metadata unavailable")));
  expect(screen.queryByText(label("en"), { exact: true })).toBeNull();
  expect(screen.getByLabelText("Exact draft")).toHaveTextContent('"arm":null');
  fireEvent.click(screen.getByRole("button", { name: "Clear full molecule" }));
  expect(screen.queryByText(label("en"), { exact: true })).toBeNull();
});

it.each(["en", "zh"] as const)(
  "resets local invalid correspondence when a cached protein version changes in %s",
  (language) => {
    render(<Study language={language} side="a" />);
    fireEvent.click(screen.getByText(label(language), { exact: true }));
    fireEvent.change(field(language), { target: { value: "1, 1, 2" } });
    expect(field(language)).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Choose protein version" }),
    );
    if (!field(language).closest("details")?.hasAttribute("open"))
      fireEvent.click(screen.getByText(label(language), { exact: true }));
    expect(field(language)).toHaveValue("");
    expect(field(language)).toHaveAttribute("aria-invalid", "false");
  },
);
