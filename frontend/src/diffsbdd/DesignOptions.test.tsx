import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DesignOptions } from "./DesignOptions";
import { optionsFor } from "./model";

it("retains the actual example count even when it differs from standard presets", () => {
  const onChange = vi.fn();
  render(
    <DesignOptions
      mode="generate"
      value={{ ...optionsFor("generate"), count: 6 }}
      onChange={onChange}
      expert={false}
      language="zh"
    />,
  );
  expect(
    screen.getByRole("combobox", { name: "这次生成多少候选？" }),
  ).toHaveValue("6");
  expect(screen.getByRole("option", { name: "6 个" })).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

function Form({ language }: { language: "en" | "zh" }) {
  const [options, setOptions] = useState(optionsFor("inpaint"));
  return (
    <DesignOptions
      mode="inpaint"
      language={language}
      value={options}
      onChange={setOptions}
      expert={false}
      fixedCount={75}
    />
  );
}

it.each(["en", "zh"] as const)(
  "makes the true local-design budget editable without expert JSON in %s",
  (language) => {
    render(<Form language={language} />);
    const input = screen.getByRole("spinbutton", {
      name:
        language === "en"
          ? "How many heavy atoms should be added to the fixed core?"
          : "在固定核心外新增多少个重原子？",
    });
    expect(input).toHaveValue(10);
    expect(input).toHaveAttribute("max", "5");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("85");
    fireEvent.change(input, { target: { value: "5" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText(
        language === "en"
          ? /75 fixed \+ 5 added = 80/
          : /固定 75 ＋ 新增 5 ＝ 80/,
      ),
    ).toBeVisible();
  },
);

it.each([
  [
    "generate",
    "crossdocked_fullatom_cond",
    ["atoms", "steps"],
    ["resamplings", "jump_length", "change_steps", "fixed_atoms", "task"],
  ],
  [
    "generate",
    "moad_fullatom_joint",
    ["resamplings", "jump_length"],
    ["change_steps", "added_atoms"],
  ],
  [
    "inpaint",
    "crossdocked_fullatom_cond",
    ["resamplings", "added_atoms", "preserve_bonds"],
    ["jump_length", "atoms", "fixed_atoms", "task"],
  ],
  [
    "diversify",
    "crossdocked_ca_cond",
    ["change_steps", "count"],
    ["steps", "atoms", "resamplings", "size_mode"],
  ],
  [
    "optimize",
    "moad_ca_cond",
    ["change_steps", "population", "rounds", "survivors"],
    ["count", "steps", "atoms", "resamplings"],
  ],
] as const)(
  "edits only controls used by native %s/%s",
  (mode, model, included, excluded) => {
    render(
      <DesignOptions
        mode={mode}
        value={{ ...optionsFor(mode), model }}
        expert
        language="en"
        fixedCount={17}
        onChange={vi.fn()}
      />,
    );
    const options = JSON.parse(
      (
        screen.getByRole("textbox", {
          name: "Native settings for this mode and model",
        }) as HTMLTextAreaElement
      ).value,
    );
    for (const name of included) expect(options).toHaveProperty(name);
    for (const name of excluded) expect(options).not.toHaveProperty(name);
  },
);

it("rejects a pasted ineffective parameter instead of claiming it controls the conditional sampler", () => {
  const onChange = vi.fn();
  render(
    <DesignOptions
      mode="generate"
      value={optionsFor("generate")}
      expert
      language="en"
      onChange={onChange}
    />,
  );
  const editor = screen.getByRole("textbox", {
    name: "Native settings for this mode and model",
  });
  fireEvent.change(editor, {
    target: { value: JSON.stringify({ resamplings: 10, steps: 250 }) },
  });
  expect(editor).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("resamplings");
  expect(onChange).not.toHaveBeenCalled();
});

it("allows switching the size policy without requiring manual removal of the previous size field", () => {
  const onChange = vi.fn();
  render(
    <DesignOptions
      mode="generate"
      value={optionsFor("generate")}
      expert
      language="en"
      onChange={onChange}
    />,
  );
  const editor = screen.getByRole("textbox", {
    name: "Native settings for this mode and model",
  });
  const changes = JSON.parse((editor as HTMLTextAreaElement).value);
  fireEvent.change(editor, {
    target: { value: JSON.stringify({ ...changes, size_mode: "sample" }) },
  });
  expect(editor).toHaveAttribute("aria-invalid", "false");
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      size_mode: "sample",
      minimum_atoms: 8,
      size_bias: 0,
    }),
  );
});

it.each(["en", "zh"] as const)(
  "shows actual optimization budget instead of an unused candidate count in %s",
  (language) => {
    function BudgetForm() {
      const [value, onChange] = useState(optionsFor("optimize"));
      return (
        <DesignOptions
          mode="optimize"
          value={value}
          onChange={onChange}
          expert={false}
          language={language}
        />
      );
    }
    render(<BudgetForm />);
    expect(
      screen.queryByRole("combobox", {
        name: language === "en" ? "How many candidates?" : "这次生成多少候选？",
      }),
    ).toBeNull();
    const population = screen.getByRole("spinbutton", {
      name:
        language === "en"
          ? "How many molecules per round?"
          : "每轮比较几个分子？",
    });
    fireEvent.change(population, { target: { value: "60" } });
    expect(screen.getByRole("alert")).toHaveTextContent("100");
    fireEvent.change(population, { target: { value: "12" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText(
        language === "en" ? /24 sampling attempts/ : /24 次采样尝试/,
      ),
    ).toBeVisible();
  },
);
