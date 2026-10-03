import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StructureViewer } from "./StructureViewer";

it("clears the prior structure when switching to a task without a result", () => {
  const { rerender } = render(
    <StructureViewer
      urls={["/api/jobs/abc/download?name=result.cif"]}
      language="zh"
    />,
  );
  const frame = screen.getByTitle("可交互分子结构") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data: { channel: "opendde-viewer", type: "ready" },
      }),
    );
  });
  expect(post).toHaveBeenCalledWith(
    {
      channel: "opendde-viewer",
      type: "load",
      value: {
        urls: ["/api/jobs/abc/download?name=result.cif"],
        comparison: false,
        focusModel: undefined,
      },
    },
    location.origin,
  );
  rerender(<StructureViewer urls={[]} language="zh" />);
  expect(post).toHaveBeenCalledWith(
    { channel: "opendde-viewer", type: "clear", value: undefined },
    location.origin,
  );
  expect(screen.getByText("预测完成后，结构会显示在这里")).toBeVisible();
});

it("focuses the actual pose and enables interactions without pretending comparison selection is supported", () => {
  render(
    <StructureViewer
      urls={[
        "/api/jobs/j/download?name=receptor.pdb",
        "/api/jobs/j/download?name=pose-001.sdf",
      ]}
      language="en"
      focusModel={1}
    />,
  );
  const frame = screen.getByTitle(
    "Interactive molecular structure",
  ) as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data: {
          channel: "opendde-viewer",
          type: "loaded",
          detail: {
            atoms: 10,
            chains: ["A"],
            ligands: [],
            residues: [],
            hasPolymer: true,
            hasInteractionContext: true,
            options: {
              mode: "cartoon",
              radius: 5,
              labels: true,
              ligand: "",
              pick: "residue",
              interactions: true,
            },
          },
        },
      }),
    ),
  );
  expect(post).toHaveBeenCalledWith(
    { channel: "opendde-viewer", type: "focus-model", value: 1 },
    location.origin,
  );
  expect(
    screen.getByRole("button", { name: "Focus selected ligand" }),
  ).toBeVisible();
  expect(screen.queryByText("Surface", { exact: true })).toBeNull();
  expect(
    screen.queryByText("Selection and display editing", { exact: true }),
  ).toBeNull();
  const toggle = screen.getByLabelText("Show interactions");
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  expect(post).toHaveBeenCalledWith(
    {
      channel: "opendde-viewer",
      type: "options",
      value: { interactions: false },
    },
    location.origin,
  );
});

it("reports selection choices only from its own same-origin loaded frame", () => {
  const loaded = vi.fn();
  const { unmount } = render(
    <StructureViewer
      urls={["/api/assets/input"]}
      language="en"
      onSceneLoaded={loaded}
    />,
  );
  const frame = screen
    .getAllByTitle("Interactive molecular structure")
    .at(-1) as HTMLIFrameElement;
  const scene = {
    chains: ["A"],
    atoms: 10,
    ligands: [],
    residues: [],
    hasPolymer: true,
    options: {
      mode: "cartoon",
      radius: 5,
      labels: true,
      ligand: "",
      pick: "residue",
    },
  };
  function event(origin: string, source: Window | null) {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source,
        data: { channel: "opendde-viewer", type: "loaded", detail: scene },
      }),
    );
  }
  act(() => event("https://untrusted.test", frame.contentWindow));
  act(() => event(location.origin, window));
  expect(loaded).not.toHaveBeenCalled();
  act(() => event(location.origin, frame.contentWindow));
  expect(loaded).toHaveBeenCalledWith(scene);
  unmount();
});
