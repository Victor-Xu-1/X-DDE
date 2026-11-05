import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { MolecularInputs } from "../guided/MolecularInputs";
import type { Component } from "../types";

afterEach(() => vi.restoreAllMocks());

function Editor() {
  const [items, onChange] = useState<Component[]>([
    { kind: "protein", value: "PREACHINGS", count: 1 },
    { kind: "ligand", value: "CCD_ATP", count: 1 },
    { kind: "ligand", value: "CCD_NAD", count: 1 },
  ]);
  return (
    <>
      <MolecularInputs
        items={items}
        onChange={onChange}
        language="en"
        expert
        workflow="complex"
      />
      <output aria-label="Current entity inputs">
        {JSON.stringify(items)}
      </output>
    </>
  );
}

it.each(["uploading", "earlier"] as const)(
  "keeps a delayed molecular upload on its actual owner when the %s entity is removed",
  async (removed) => {
    const asset = {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "ligand" as const,
      name: "controlled-upload.sdf",
      sha256: "a".repeat(64),
      suffix: ".sdf",
      size: 25,
      created_at: "",
    };
    let finish!: (value: typeof asset) => void;
    vi.spyOn(api, "upload").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/assets/" + asset.id + "/metadata")
        ? Response.json(asset)
        : new Response(null, { status: 404 }),
    );
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(
      screen.getAllByText("Use an existing 3D molecule file")[0],
    );
    await user.upload(
      screen.getAllByLabelText("Upload Ligand file")[0],
      new File(
        ["controlled transport bytes; no chemistry or inference"],
        asset.name,
      ),
    );
    expect(finish).toBeTypeOf("function");
    await user.click(
      screen.getByRole("button", {
        name: removed === "uploading" ? "Remove 2" : "Remove 1",
      }),
    );
    await act(async () => finish(asset));
    const items = JSON.parse(
      screen.getByLabelText("Current entity inputs").textContent!,
    ) as Component[];
    expect(items).toHaveLength(2);
    if (removed === "uploading") {
      expect(items.map((item) => item.value)).toEqual([
        "PREACHINGS",
        "CCD_NAD",
      ]);
      expect(items.every((item) => !item.ligand_file)).toBe(true);
    } else {
      expect(items[0].ligand_file).toBe(asset.id);
      expect(items[1]).toEqual({ kind: "ligand", value: "CCD_NAD", count: 1 });
    }
  },
);
