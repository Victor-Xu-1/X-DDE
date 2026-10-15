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
