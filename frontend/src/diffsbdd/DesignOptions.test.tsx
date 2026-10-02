import { render, screen } from "@testing-library/react";
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
