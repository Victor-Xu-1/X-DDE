import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ScientificChoices } from "./ScientificChoices";
import { nativeDefaults } from "./generated";
import { validScientificChoices } from "./validation";
import type { Language } from "../types";
import type { ScientificPayload } from "./types";

afterEach(cleanup);
it("keeps numerical native counts while presenting distinct selectable choices", async () => {
  const change = vi.fn();
  render(
    <ScientificChoices
      program="ligandmpnn"
      language="en"
      payload={{ kind: "ligandmpnn", candidates: 20 }}
      onChange={change}
      options={{ device: "cpu", cpu: 2, memory_mib: 4096, seed: 101 }}
      onOptions={vi.fn()}
      expert={false}
      onExpert={vi.fn()}
    />,
  );
  expect(screen.getByRole("radio", { name: "20 candidates" })).toBeChecked();
  await userEvent
    .setup()
    .click(screen.getByRole("radio", { name: "50 candidates" }));
  expect(change).toHaveBeenCalledExactlyOnceWith({ candidates: 50 });
});

function BudgetForm({ language }: { language: Language }) {
  const [payload, setPayload] = useState<ScientificPayload>({
    ...nativeDefaults.boltzgen,
    kind: "boltzgen",
  });
  const [expert, setExpert] = useState(false);
  return (
    <>
      <ScientificChoices
        program="boltzgen"
        language={language}
        payload={payload}
        onChange={(patch) =>
          setPayload((current) => ({ ...current, ...patch }))
        }
        expert={expert}
        onExpert={setExpert}
        options={{ cpu: 2, memory_mib: 8192, device: "cuda", seed: 101 }}
        onOptions={() => undefined}
      />
      <button disabled={!validScientificChoices(payload)}>Continue</button>
    </>
  );
}

it.each(["en", "zh"] as const)(
  "supports a deliberate small binder run and retains its selection after closing expert tuning in %s",
  async (language) => {
    const user = userEvent.setup();
    render(<BudgetForm language={language} />);
    const toggle = language === "en" ? "Expert tuning" : "专家微调";
    await user.click(screen.getByRole("button", { name: toggle }));
    const generated = screen.getByRole("spinbutton", {
      name: language === "en" ? "Generated candidates" : "生成候选数",
    });
    const retained = screen.getByRole("spinbutton", {
      name: language === "en" ? "Retained candidates" : "保留候选数",
    });
    await user.clear(generated);
    await user.type(generated, "4");
    // Invalid intermediate edits remain visible; the form never silently clamps a budget.
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.clear(retained);
    await user.type(retained, "2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: toggle }));
    expect(
      screen.getByRole("radio", {
        name: language === "en" ? "4 candidates" : "4 个候选",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("combobox", {
        name: language === "en" ? "Retain candidates" : "保留候选",
      }),
    ).toHaveValue("2");
    await user.click(screen.getByRole("button", { name: toggle }));
    expect(
      screen.getByRole("spinbutton", {
        name: language === "en" ? "Generated candidates" : "生成候选数",
      }),
    ).toHaveValue(4);
  },
);

it.each(["en", "zh"] as const)(
  "supports an explicit two-design pilot without expert controls in %s",
  async (language) => {
    render(<BudgetForm language={language} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("radio", {
        name: language === "en" ? "2 candidates" : "2 个候选",
      }),
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: language === "en" ? "Retain candidates" : "保留候选",
      }),
      "2",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: language === "en" ? "Expert tuning" : "专家微调",
      }),
    );
    expect(
      screen.queryByRole("spinbutton", {
        name: language === "en" ? "Random seed" : "随机种子",
      }),
    ).not.toBeInTheDocument();
  },
);

it("blocks fractional, empty and server-out-of-range budgets without replacing the user's edit", async () => {
  const user = userEvent.setup();
  render(<BudgetForm language="en" />);
  await user.click(screen.getByRole("button", { name: "Expert tuning" }));
  const count = screen.getByRole("spinbutton", {
    name: "Generated candidates",
  });
  const retain = screen.getByRole("spinbutton", {
    name: "Retained candidates",
  });
  for (const value of ["", "2.5", "201"]) {
    await user.clear(count);
    if (value) await user.type(count, value);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("alert")).toBeVisible();
  }
  await user.clear(count);
  await user.type(count, "200");
  await user.clear(retain);
  await user.type(retain, "51");
  expect(retain).toHaveValue(51);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
});
