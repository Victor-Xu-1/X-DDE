import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import type { Asset } from "../operations/types";
import type { MoleculeRef } from "./types";
import { SequencePicker } from "./SequencePicker";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";

const raw = ">STAT6_pathway_VH\nEVQLVESGGGLEQPGGSLRLSCAGSGFTFRDYAMT";
const savedAsset: Asset = {
  id: "paste-file",
  name: "VH.fasta",
  kind: "sequences",
  suffix: ".fasta",
  sha256: "a".repeat(64),
  size: raw.length,
  created_at: "2026-11-06",
};
const historical: Asset = {
  ...savedAsset,
  id: "historical",
  name: "STAT6-pathway.fasta",
  sha256: "b".repeat(64),
};
const reference: MoleculeRef = {
  asset_id: savedAsset.id,
  sha256: savedAsset.sha256,
  record: 0,
  conformer: 0,
  version_id: "paste-version",
};
beforeEach(() => {
  vi.spyOn(api, "assets").mockResolvedValue([]);
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.endsWith("/metadata")
        ? historical
        : catalogFixture([], [historical])) as never,
  );
  vi.spyOn(api, "post").mockResolvedValue({
    id: reference.version_id,
    kind: "sequence",
    reference,
  } as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Editor({ language }: { language: "en" | "zh" }) {
  const [value, change] = useState<MoleculeRef | null>(null);
  return (
    <>
      <SequencePicker
        language={language}
        label="Sequence input"
        value={value}
        onChange={change}
      />
      <output aria-label="Current input">
        {value ? JSON.stringify(value) : "No input"}
      </output>
      <button disabled={!value}>Next with sequences</button>
    </>
  );
}
const names = (language: "en" | "zh") => ({
  paste: language === "zh" ? "粘贴序列" : "Paste sequences",
  file: language === "zh" ? "上传 FASTA 文件" : "Upload FASTA file",
  history: language === "zh" ? "历史文件" : "Historical files",
  text: language === "zh" ? "序列或 FASTA" : "Sequence or FASTA",
  confirm: language === "zh" ? "确认序列" : "Confirm sequences",
});

it.each(["en", "zh"] as const)(
  "retains an unconfirmed sequence when browsing other sources (%s)",
  async (language) => {
    const user = userEvent.setup(),
      labels = names(language);
    render(<Editor language={language} />);
    await user.type(screen.getByRole("textbox", { name: labels.text }), raw);
    for (const source of [labels.file, labels.history]) {
      await user.click(screen.getByRole("radio", { name: source }));
      await user.click(screen.getByRole("radio", { name: labels.paste }));
      expect(screen.getByRole("textbox", { name: labels.text })).toHaveValue(
        raw,
      );
      expect(
        screen.getByRole("button", { name: "Next with sequences" }),
      ).toBeDisabled();
    }
    expect(api.post).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "restores the exact confirmed paste but invalidates it after editing (%s)",
  async (language) => {
    const upload = vi.spyOn(api, "upload").mockResolvedValue(savedAsset),
      user = userEvent.setup(),
      labels = names(language);
    render(<Editor language={language} />);
    await user.type(screen.getByRole("textbox", { name: labels.text }), raw);
    await user.click(screen.getByRole("button", { name: labels.confirm }));
    await waitFor(() =>
      expect(screen.getByLabelText("Current input")).toHaveTextContent(
        JSON.stringify(reference),
      ),
    );
    await user.click(screen.getByRole("radio", { name: labels.file }));
    expect(
      screen.getByRole("button", { name: "Next with sequences" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: labels.paste }));
    expect(screen.getByRole("textbox", { name: labels.text })).toHaveValue(raw);
    expect(screen.getByLabelText("Current input")).toHaveTextContent(
      JSON.stringify(reference),
    );
    expect(screen.getByRole("button", { name: labels.confirm })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: labels.text }), "A");
    expect(
      screen.getByRole("button", { name: "Next with sequences" }),
    ).toBeDisabled();
    expect(upload).toHaveBeenCalledOnce();
  },
);

it.each(["en", "zh"] as const)(
  "lets history resolve while an abandoned paste save is pending (%s)",
  async (language) => {
    let finish!: (asset: Asset) => void;
    vi.spyOn(api, "upload").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup(),
      labels = names(language);
    render(<Editor language={language} />);
    await user.type(screen.getByRole("textbox", { name: labels.text }), raw);
    await user.click(screen.getByRole("button", { name: labels.confirm }));
    await user.click(screen.getByRole("radio", { name: labels.history }));
    const picker = await screen.findByRole("combobox", {
      name:
        language === "zh"
          ? "Sequence input · 历史文件"
          : "Sequence input · Historical files",
    });
    await screen.findByRole("option", { name: historical.name });
    try {
      expect(picker).toBeEnabled();
      await user.selectOptions(picker, "file:" + historical.id);
      await waitFor(() =>
        expect(screen.getByLabelText("Current input")).toHaveTextContent(
          historical.id,
        ),
      );
    } finally {
      await act(async () => {
        finish(savedAsset);
      });
    }
    expect(screen.getByLabelText("Current input")).toHaveTextContent(
      historical.id,
    );
    expect(screen.getByLabelText("Current input")).not.toHaveTextContent(
      savedAsset.id,
    );
  },
);
