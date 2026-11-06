import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PropertyForm } from "./PropertyForm";
import { api } from "../api";
import * as client from "../api";
import type { Asset } from "./types";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";

const asset: Asset = {
  id: "STAT6-series",
  name: "STAT6-study-series.sdf",
  kind: "ligand",
  suffix: ".sdf",
  size: 1200,
  sha256: "a".repeat(64),
  created_at: "2026-11-06",
};
const smiles = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3";
beforeEach(() => {
  vi.spyOn(api, "assets").mockResolvedValue([]);
  vi.spyOn(api, "submit");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function service(metadata: () => Promise<Asset>) {
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path.endsWith("/metadata")) return (await metadata()) as never;
    if (path.startsWith("/research/input-catalog?"))
      return catalogFixture([], []) as never;
    return { availability: { configuration_present: true } } as never;
  });
}
const next = (zh: boolean) =>
  screen.getByRole("button", { name: zh ? "下一步" : "Next" });

it.each(["en", "zh"] as const)(
  "waits for matching file metadata before advancing (%s)",
  async (language) => {
    let finish!: (value: Asset) => void;
    service(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup(),
      zh = language === "zh";
    render(
      <PropertyForm
        language={language}
        initialFile={asset.id}
        onCreated={vi.fn()}
      />,
    );
    await user.click(next(zh));
    try {
      expect(next(zh)).toBeDisabled();
    } finally {
      await act(async () => finish(asset));
    }
    await waitFor(() => expect(next(zh)).toBeEnabled());
    expect(api.submit).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "blocks a file whose metadata could not be confirmed (%s)",
  async (language) => {
    service(async () => {
      throw new Error("metadata unavailable");
    });
    const user = userEvent.setup(),
      zh = language === "zh";
    render(
      <PropertyForm
        language={language}
        initialFile={asset.id}
        onCreated={vi.fn()}
      />,
    );
    await user.click(next(zh));
    await screen.findByRole("button", {
      name: zh ? "重新读取文件" : "Retry selected file",
    });
    expect(
      screen.getByText(zh ? "所选文件尚未核验" : "Selected file not verified"),
    ).toBeVisible();
    expect(next(zh)).toBeDisabled();
    expect(api.submit).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "rejects a changed hash for a version-bound molecular record (%s)",
  async (language) => {
    service(async () => asset);
    const user = userEvent.setup(),
      zh = language === "zh";
    render(
      <PropertyForm
        language={language}
        initialFile={asset.id}
        onCreated={vi.fn()}
        scientificInput={{
          asset_id: asset.id,
          sha256: "b".repeat(64),
          record: 4,
          conformer: 0,
          version_id: "original-version",
        }}
      />,
    );
    await user.click(next(zh));
    await screen.findByText(asset.name, { selector: ".selected-file" });
    expect(next(zh)).toBeDisabled();
    expect(api.submit).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "does not let SMILES hide an unresolved file in combined input (%s)",
  async (language) => {
    service(async () => {
      throw new Error("metadata unavailable");
    });
    const user = userEvent.setup(),
      zh = language === "zh";
    render(
      <PropertyForm
        language={language}
        initialFile={asset.id}
        initialSmiles={smiles}
        onCreated={vi.fn()}
      />,
    );
    await user.click(next(zh));
    await screen.findByRole("button", {
      name: zh ? "重新读取文件" : "Retry selected file",
    });
    expect(next(zh)).toBeDisabled();
    expect(api.submit).not.toHaveBeenCalled();
  },
);
