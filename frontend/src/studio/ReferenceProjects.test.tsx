import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ReferenceProjects } from "./ReferenceProjects";

it("labels public structures as references and selects the actual PDB entry", async () => {
  const choose = vi.fn();
  render(<ReferenceProjects language="zh" onChoose={choose} onNew={vi.fn()} />);
  expect(screen.getByText(/公开实验结构 · 仅用于浏览参考/)).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /KRAS G12D/ }));
  expect(choose).toHaveBeenCalledWith("7RPZ");
  expect(screen.getByTitle(/KRAS G12D 实验参考缩略图/)).toHaveAttribute(
    "src",
    "/viewer.html?reference=7RPZ&compact=1",
  );
});
