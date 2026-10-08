import { version as productVersion } from "../../package.json";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StructureViewer } from "./StructureViewer";
import { defaultOptions } from "./protocol";

it("defers residue focus until the requested scene is loaded and retains repeated selections", () => {
  const props = {
    urls: ["/api/assets/aa-11"],
    language: "en" as const,
    focusResidue: { residue: "C:PRO572", nonce: 1 },
  };
  const { rerender } = render(<StructureViewer {...props} />);
  const frame = screen.getByTitle(
    "Interactive molecular structure",
  ) as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  const message = (type: string, detail?: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          source: frame.contentWindow,
          data: { channel: "opendde-viewer", type, detail },
        }),
      );
    });
  const scene = {
    chains: ["C"],
    atoms: 100,
    hasPolymer: true,
    residues: [],
    ligands: [],
    options: defaultOptions,
  };
  const focuses = () =>
    post.mock.calls.filter(([data]) => data.type === "residue");
  message("ready");
  expect(focuses()).toHaveLength(0);
  message("loaded", scene);
  expect(focuses()).toHaveLength(1);
  expect(focuses()[0][0].value).toBe("C:PRO572");
  rerender(
    <StructureViewer
      {...props}
      focusResidue={{ residue: "C:PRO572", nonce: 2 }}
    />,
  );
  expect(focuses()).toHaveLength(2);
  post.mockClear();
  rerender(
    <StructureViewer
      {...props}
      urls={["/api/assets/bb-22"]}
      focusResidue={{ residue: "C:PRO573", nonce: 3 }}
    />,
  );
  expect(focuses()).toHaveLength(0);
  message("loaded", scene);
  expect(focuses()).toHaveLength(1);
  expect(focuses()[0][0].value).toBe("C:PRO573");
});

it("centers only a selected ligand in the current loaded source, without resetting a user's camera on rerender", () => {
  const props = {
    urls: ["/api/assets/aa-11"],
    language: "en" as const,
    focusLigand: "B:LIG301",
  };
  const { rerender } = render(<StructureViewer {...props} />);
  const frame = screen.getByTitle(
    "Interactive molecular structure",
  ) as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  const message = (type: string, detail?: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          source: frame.contentWindow,
          data: { channel: "opendde-viewer", type, detail },
        }),
      );
    });
  const scene = {
    chains: ["B"],
    atoms: 1200,
    hasPolymer: true,
    residues: [],
    ligands: [
      { key: "B:LIG301", chain: "B", resn: "LIG", resi: 301, icode: "" },
    ],
    options: defaultOptions,
  };
  message("ready");
  expect(
    post.mock.calls.some(
      ([data]) => data.type === "options" && data.value?.ligand,
    ),
  ).toBe(false);
  message("loaded", scene);
  expect(screen.getByLabelText("Central ligand")).toHaveValue("B:LIG301");
  expect(post).toHaveBeenCalledWith(
    {
      channel: "opendde-viewer",
      type: "options",
      value: { ligand: "B:LIG301" },
    },
    location.origin,
  );
  expect(
    post.mock.calls.filter(
      ([data]) => data.type === "options" && data.value?.ligand,
    ),
  ).toHaveLength(1);
  post.mockClear();
  rerender(<StructureViewer {...props} language="zh" />);
  expect(
    post.mock.calls.some(
      ([data]) => data.type === "options" && data.value?.ligand,
    ),
  ).toBe(false);
  rerender(<StructureViewer {...props} focusLigand="A:missing" />);
  expect(
    post.mock.calls.some(
      ([data]) => data.type === "options" && data.value?.ligand,
    ),
  ).toBe(false);
  rerender(<StructureViewer {...props} urls={["/api/assets/bb-22"]} />);
  expect(
    post.mock.calls.some(
      ([data]) => data.type === "options" && data.value?.ligand,
    ),
  ).toBe(false);
  message("loaded", { ...scene, ligands: [] });
  expect(
    post.mock.calls.some(
      ([data]) => data.type === "options" && data.value?.ligand,
    ),
  ).toBe(false);
  message("loaded", scene);
  expect(
    post.mock.calls.filter(
      ([data]) => data.type === "options" && data.value?.ligand,
    ),
  ).toHaveLength(1);
});

it("waits for the new pose before sending atom selections and clears prior display errors", () => {
  const { rerender } = render(
    <StructureViewer
      urls={["/api/jobs/a/download?name=one.sdf"]}
      language="zh"
    />,
  );
  const frame = screen.getByTitle("可交互分子结构") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  const message = (type: string, detail?: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          source: frame.contentWindow,
          data: { channel: "opendde-viewer", type, detail },
        }),
      );
    });
  const scene = {
    chains: [],
    atoms: 40,
    ligands: [],
    residues: [],
    hasPolymer: false,
    options: {
      mode: "cartoon",
      radius: 5,
      labels: true,
      ligand: "",
      pick: "atom",
      interactions: true,
      contactLimit: 5,
    },
  };
  message("ready");
  message("loaded", scene);
  post.mockClear();
  rerender(
    <StructureViewer
      urls={["/api/jobs/a/download?name=two.sdf"]}
      language="zh"
    />,
  );
  expect(post.mock.calls.some(([data]) => data.type === "load")).toBe(true);
  expect(post.mock.calls.some(([data]) => data.type === "atom-region")).toBe(
    false,
  );
  message("error", "Could not update structure display.");
  message("loaded", scene);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(post.mock.calls.some(([data]) => data.type === "atom-region")).toBe(
    true,
  );
});

it("clears the prior structure when switching to a task without a result", () => {
  const { rerender } = render(
    <StructureViewer
      urls={["/api/jobs/abc/download?name=result.cif"]}
      language="zh"
    />,
  );
  const frame = screen.getByTitle("可交互分子结构") as HTMLIFrameElement;
  const bootstrap = new URL(frame.src);
  expect(bootstrap.pathname).toBe("/viewer.html");
  expect(bootstrap.searchParams.get("v")).toBe(productVersion);
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
  expect(
    screen.getByText("选择文件或构象后，三维结构会显示在这里"),
  ).toBeVisible();
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
              contactLimit: 5,
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
  expect(screen.getByRole("button", { name: "Surface" })).toBeVisible();
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

it("charge surface accepts only its own frame summary and clears it when returning to backbone or a new source", () => {
  const { rerender } = render(
    <StructureViewer urls={["/api/assets/one"]} language="zh" />,
  );
  const frame = screen.getByTitle("可交互分子结构") as HTMLIFrameElement;
  function message(
    type: string,
    detail: unknown,
    origin = location.origin,
    source = frame.contentWindow,
  ) {
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          source,
          data: { channel: "opendde-viewer", type, detail },
        }),
      ),
    );
  }
  message("loaded", {
    chains: ["A"],
    atoms: 100,
    ligands: [],
    residues: [],
    hasPolymer: true,
    options: {
      mode: "cartoon",
      radius: 5,
      labels: true,
      ligand: "",
      pick: "residue",
      interactions: true,
      contactLimit: 5,
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "分子表面" }));
  const summary = { total: 100, input: 0, estimated: 90, missing: 10 };
  message("surface", summary, "https://untrusted.test");
  message("surface", summary, location.origin, window);
  expect(screen.queryByText("近似电性")).toBeNull();
  message("surface", summary);
  expect(screen.getByText("近似电性")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "整体骨架" }));
  expect(screen.queryByText("近似电性")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "分子表面" }));
  expect(screen.getByText("正在生成电性表面…")).toBeVisible();
  message("surface", summary);
  rerender(<StructureViewer urls={[]} language="zh" />);
  expect(screen.queryByText("近似电性")).toBeNull();
});
