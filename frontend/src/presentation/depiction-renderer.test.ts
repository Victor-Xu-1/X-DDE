import { afterEach, describe, expect, it, vi } from "vitest";
import { DepictionRenderer, depictionDataUrl } from "./depiction-renderer";
import type { Ketcher } from "../editors/scientificEditor";

afterEach(() => vi.unstubAllGlobals());

function nativeRenderer() {
  const calls: string[] = [];
  const editor = {
    structService: {
      toggleExplicitHydrogens: vi.fn(async (data: { struct: string }) => {
        calls.push("fold-hydrogens");
        return { struct: `folded:${data.struct}` };
      }),
    },
    editor: {
      setOptions: vi.fn((_options: string) => {
        calls.push("style");
      }),
    },
    setMolecule: vi.fn(async (_structure: string) => {
      calls.push("load");
    }),
    layout: vi.fn(async () => {
      calls.push("layout");
    }),
    dearomatize: vi.fn(async () => {
      calls.push("kekule");
    }),
    getMolfile: vi.fn(async () => {
      calls.push("read");
      return "native-kekule-mol";
    }),
    generateImage: vi.fn(async () => {
      calls.push("draw");
      return new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {
        type: "image/svg+xml",
      });
    }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ installed: { ketcher: { version: "3.18.0" } } }),
    })),
  );
  const frame = {
    contentWindow: { ketcher: editor as unknown as Ketcher },
  } as unknown as HTMLIFrameElement;
  return { renderer: new DepictionRenderer(() => frame), editor, calls };
}

describe("Native aromatic depiction", () => {
  it("lays out and assigns native alternating bonds on a display copy before exporting", async () => {
    const { renderer, editor, calls } = nativeRenderer();
    const source = Object.freeze({ smiles: "c1ccccc1" });
    try {
      await renderer.render(source, new AbortController().signal, 2.2);
      expect(calls).toEqual([
        "style",
        "fold-hydrogens",
        "load",
        "layout",
        "kekule",
        "read",
        "draw",
      ]);
      expect(
        JSON.parse(editor.editor.setOptions.mock.calls[0][0]),
      ).toMatchObject({
        showHydrogenLabels: "Hetero",
      });
      expect(editor.structService.toggleExplicitHydrogens).toHaveBeenCalledWith(
        {
          struct: source.smiles,
          mode: "fold",
          output_format: "chemical/x-mdl-molfile",
        },
      );
      expect(editor.setMolecule).toHaveBeenCalledWith("folded:c1ccccc1");
      expect(editor.generateImage).toHaveBeenCalledWith("native-kekule-mol", {
        outputFormat: "svg",
        backgroundColor: "1,1,1",
        bondThickness: 2.2,
      });
      expect(source.smiles).toBe("c1ccccc1");
    } finally {
      renderer.close();
    }
  });
  it("does not export or cache an incomplete aromatic transformation", async () => {
    const { renderer, editor } = nativeRenderer();
    const source = { smiles: "c1ccccc1" };
    editor.dearomatize.mockRejectedValueOnce(new Error("No valid Kekulé form"));
    try {
      await expect(
        renderer.render(source, new AbortController().signal),
      ).rejects.toThrow("No valid Kekulé form");
      expect(editor.generateImage).not.toHaveBeenCalled();
      await renderer.render(source, new AbortController().signal);
      expect(editor.dearomatize).toHaveBeenCalledTimes(2);
      expect(editor.generateImage).toHaveBeenCalledTimes(1);
    } finally {
      renderer.close();
    }
  });
});

describe("Native SVG image transport under the platform CSP", () => {
  it("preserves the drawing bytes in an allowed image data URL", async () => {
    const drawing =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Cl–N</text></svg>';
    const url = await depictionDataUrl(
      new Blob([drawing], { type: "image/svg+xml" }),
    );
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
    const bytes = Uint8Array.from(atob(url.split(",")[1]), (byte) =>
      byte.charCodeAt(0),
    );
    expect(new TextDecoder().decode(bytes)).toBe(drawing);
  });
  it("refuses empty, non-image and oversized payloads", async () => {
    for (const blob of [
      new Blob([], { type: "image/svg+xml" }),
      new Blob(["<html>"], { type: "text/html" }),
      new Blob([new Uint8Array(2 * 1024 ** 2 + 1)], { type: "image/svg+xml" }),
    ])
      await expect(depictionDataUrl(blob)).rejects.toThrow(
        "bounded native SVG",
      );
  });
});

describe("Source-aware drawing queue", () => {
  it("skips abandoned queued drawings before they touch the native editor", async () => {
    const { renderer, editor } = nativeRenderer();
    let release!: (value: Blob) => void;
    editor.generateImage.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    const first = renderer.render(
      { smiles: "c1ccccc1" },
      new AbortController().signal,
    );
    await vi.waitFor(() =>
      expect(editor.generateImage).toHaveBeenCalledTimes(1),
    );
    const abandoned = new AbortController();
    const old = renderer
      .render({ smiles: "CCN" }, abandoned.signal)
      .catch((error) => error.name);
    const current = renderer.render(
      { smiles: "CN" },
      new AbortController().signal,
    );
    abandoned.abort();
    release(new Blob(["<svg/>"], { type: "image/svg+xml" }));
    try {
      await first;
      expect(await old).toBe("AbortError");
      await current;
      expect(editor.setMolecule.mock.calls.map((args) => args[0])).toEqual([
        "folded:c1ccccc1",
        "folded:CN",
      ]);
    } finally {
      renderer.close();
    }
  });
  it("retains a shared drawing while another visible consumer still needs it", async () => {
    const { renderer, editor } = nativeRenderer();
    const hidden = new AbortController();
    const first = renderer
      .render({ smiles: "c1ccccc1" }, hidden.signal)
      .catch((error) => error.name);
    const current = renderer.render(
      { smiles: "c1ccccc1" },
      new AbortController().signal,
    );
    hidden.abort();
    try {
      expect(await first).toBe("AbortError");
      expect(await current).toBeInstanceOf(Blob);
      expect(editor.generateImage).toHaveBeenCalledTimes(1);
    } finally {
      renderer.close();
    }
  });
});
