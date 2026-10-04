import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InteractionDiagram } from "./InteractionDiagram";

describe("native contact relationships", () => {
  it("keeps both residue identities and exact distances visible without implying energy", () => {
    const edges = Array.from({ length: 12 }, (_, i) => ({
      left: "B:TYR" + (20 + i),
      right: "A:ASP" + (100 + i),
      kind: "hbond",
      distance: 2.87 + i / 100,
    }));
    render(<InteractionDiagram edges={edges} label="complex" language="zh" />);
    const diagram = screen.getByRole("group", { name: "原生接触关系示意图" });
    expect(within(diagram).getByText("B:TYR20")).toBeVisible();
    expect(within(diagram).getByText("A:ASP100")).toBeVisible();
    expect(within(diagram).getByText("2.87 Å")).toBeVisible();
    expect(within(diagram).queryByText("A:ASP108")).toBeNull();
    fireEvent.change(screen.getByLabelText("显示接触"), {
      target: { value: "20" },
    });
    expect(within(diagram).getByText("A:ASP111")).toBeVisible();
    fireEvent.click(screen.getByLabelText("显示距离"));
    expect(within(diagram).queryByText("2.87 Å")).toBeNull();
    expect(screen.getByText(/线条不表示作用能或亲和力/)).toBeVisible();
    expect(screen.getByRole("button", { name: "下载图表 SVG" })).toBeEnabled();
  });
});
