import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ViewerControls } from "./ViewerControls";
import { defaultOptions, validSource, type SceneInfo } from "./protocol";
const scene: SceneInfo = {
  atoms: 3,
  hasPolymer: true,
  chains: ["A", "B"],
  residues: [{ key: "A:LYS:8:", chain: "A", resn: "LYS", resi: 8, icode: "" }],
  ligands: [{ key: "B:LIG:1:", chain: "B", resn: "LIG", resi: 1, icode: "" }],
};
it("allows supported pocket and selection actions and explains display-only editing", () => {
  const send = vi.fn(),
    options = vi.fn();
  render(
    <ViewerControls
      language="zh"
      scene={scene}
      options={{ ...defaultOptions, ligand: scene.ligands[0].key }}
      selection={{
        chain: "A",
        residue: "LYS8",
        atom: "CA",
        element: "C",
        count: 9,
      }}
      distance={null}
      disabled={false}
      onOptions={options}
      send={send}
    />,
  );
  fireEvent.change(screen.getByLabelText("口袋范围"), {
    target: { value: "4" },
  });
  expect(options).toHaveBeenCalledWith({ radius: 4, mode: "pocket" });
  const editor = screen.getByText("点选与显示编辑").closest("details");
  expect(editor).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("点选与显示编辑"));
  fireEvent.click(screen.getByRole("button", { name: "隐藏选中" }));
  expect(send).toHaveBeenCalledWith("selection-action", "hide");
  fireEvent.click(screen.getByText("从列表选择残基"));
  fireEvent.click(screen.getByRole("button", { name: "A:LYS8" }));
  expect(send).toHaveBeenCalledWith("residue", "A:LYS:8:");
  fireEvent.click(screen.getByRole("button", { name: "选择和编辑说明" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "原始结构和预测输入不变",
  );
});
it("allows display edits for a renderer-selected range without inventing a constraint atom", () => {
  const send = vi.fn();
  render(
    <ViewerControls
      language="en"
      scene={scene}
      options={defaultOptions}
      selection={null}
      hasDisplaySelection
      distance={null}
      disabled={false}
      onOptions={vi.fn()}
      send={send}
    />,
  );
  const summary = screen.getByText("Selection and display editing");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(summary);
  expect(screen.getByRole("status")).toHaveTextContent(
    "A structure range is selected",
  );
  fireEvent.click(screen.getByRole("button", { name: "Hide selection" }));
  expect(send).toHaveBeenLastCalledWith("selection-action", "hide");
});
it("retains requested editing when leaving measurement mode", () => {
  const props = {
    language: "en" as const,
    scene,
    selection: null,
    distance: null,
    disabled: false,
    onOptions: vi.fn(),
    send: vi.fn(),
  };
  const view = render(<ViewerControls {...props} options={defaultOptions} />);
  const editor = screen
    .getByText("Selection and display editing")
    .closest("details");
  expect(editor).not.toHaveAttribute("open");
  view.rerender(
    <ViewerControls
      {...props}
      options={{ ...defaultOptions, pick: "distance" }}
    />,
  );
  expect(editor).toHaveAttribute("open");
  view.rerender(<ViewerControls {...props} options={defaultOptions} />);
  expect(editor).toHaveAttribute("open");
});
it("does not expose a pocket radius on a ligand-only structure", () => {
  render(
    <ViewerControls
      language="en"
      scene={{ ...scene, hasPolymer: false, residues: [] }}
      options={defaultOptions}
      selection={null}
      distance={null}
      disabled={false}
      onOptions={vi.fn()}
      send={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("Pocket radius")).not.toBeInTheDocument();
  expect(
    screen.getByText("Selection and display editing").closest("details"),
  ).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Selection and display editing"));
  expect(screen.getByRole("button", { name: "Hide selection" })).toBeDisabled();
});
it("restricts the renderer to same-origin prediction artifacts", () => {
  expect(
    validSource("/api/jobs/abc/download?name=a.cif", "http://localhost:4320")
      .pathname,
  ).toBe("/api/jobs/abc/download");
  for (const value of [
    "https://example.org/a.cif",
    "/references/7RPZ.cif",
    "file:///a",
    "/api/session",
  ])
    expect(() => validSource(value, "http://localhost:4320")).toThrow();
});
