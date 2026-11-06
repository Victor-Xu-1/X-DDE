import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AssetPicker } from "./AssetPicker";
import type { Asset, AssetKind } from "./types";
import { api } from "../api";
import * as client from "../api";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";

const historical: Asset = {
  id: "history",
  name: "STAT6-9BIG-original.pdb",
  kind: "structure",
  suffix: ".pdb",
  size: 1200,
  sha256: "a".repeat(64),
  created_at: "2026-11-06",
};
const uploaded: Asset = {
  ...historical,
  id: "upload",
  name: "STAT6-4Y5U-alternate.pdb",
  sha256: "b".repeat(64),
};
beforeEach(() => {
  vi.spyOn(api, "assets").mockResolvedValue([]);
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.endsWith("/metadata")
        ? historical
        : catalogFixture([], [historical])) as never,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Editor({ language }: { language: "en" | "zh" }) {
  const [value, onChange] = useState("");
  return (
    <>
      <AssetPicker
        kind="structure"
        label="Receptor"
        language={language}
        value={value}
        onChange={onChange}
      />
      <output aria-label="Current input">{value || "None"}</output>
      <button onClick={() => onChange("")}>Reset current input</button>
    </>
  );
}
function pendingUpload() {
  let finish!: (asset: Asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return () => act(async () => finish(uploaded));
}

it.each(["en", "zh"] as const)(
  "allows history selection while an abandoned upload is pending (%s)",
  async (language) => {
    const finish = pendingUpload(),
      user = userEvent.setup(),
      zh = language === "zh";
    render(<Editor language={language} />);
    await user.upload(
      screen.getByLabelText((zh ? "上传 " : "Upload ") + "Receptor"),
      new File(["ATOM"], uploaded.name),
    );
    await user.click(
      screen.getByText(zh ? "历史文件" : "Historical files", {}),
    );
    await screen.findByRole("option", { name: historical.name });
    const picker = screen.getByRole("combobox", {
      name: "Receptor",
    });
    try {
      expect(picker).toBeEnabled();
      await user.selectOptions(picker, historical.id);
      await waitFor(() =>
        expect(screen.getByLabelText("Current input")).toHaveTextContent(
          historical.id,
        ),
      );
    } finally {
      await finish();
    }
    expect(screen.getByLabelText("Current input")).toHaveTextContent(
      historical.id,
    );
  },
);

it.each(["en", "zh"] as const)(
  "restores each source without re-uploading and honors a controlled clear (%s)",
  async (language) => {
    const upload = vi.spyOn(api, "upload").mockResolvedValue(uploaded);
    const user = userEvent.setup(),
      zh = language === "zh";
    render(<Editor language={language} />);
    await user.upload(
      screen.getByLabelText((zh ? "上传 " : "Upload ") + "Receptor"),
      new File(["ATOM"], uploaded.name),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Current input")).toHaveTextContent(
        uploaded.id,
      ),
    );
    await user.click(
      screen.getByRole("radio", { name: zh ? "历史文件" : "Historical files" }),
    );
    await screen.findByRole("option", { name: historical.name });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Receptor" }),
      historical.id,
    );
    await user.click(
      screen.getByRole("radio", {
        name: zh ? "上传新文件" : "Upload a new file",
      }),
    );
    expect(screen.getByLabelText("Current input")).toHaveTextContent(
      uploaded.id,
    );
    await user.click(
      screen.getByRole("radio", { name: zh ? "历史文件" : "Historical files" }),
    );
    expect(screen.getByLabelText("Current input")).toHaveTextContent(
      historical.id,
    );
    await user.click(
      screen.getByRole("radio", {
        name: zh ? "上传新文件" : "Upload a new file",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Reset current input" }),
    );
    await user.click(
      screen.getByRole("radio", { name: zh ? "历史文件" : "Historical files" }),
    );
    await user.click(
      screen.getByRole("radio", {
        name: zh ? "上传新文件" : "Upload a new file",
      }),
    );
    expect(screen.getByLabelText("Current input")).toHaveTextContent("None");
    expect(upload).toHaveBeenCalledOnce();
  },
);

it.each(["en", "zh"] as const)(
  "does not carry a detached upload error into history (%s)",
  async (language) => {
    let reject!: (error: Error) => void;
    vi.spyOn(api, "upload").mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const user = userEvent.setup(),
      zh = language === "zh";
    render(<Editor language={language} />);
    await user.upload(
      screen.getByLabelText((zh ? "上传 " : "Upload ") + "Receptor"),
      new File(["ATOM"], uploaded.name),
    );
    await user.click(
      screen.getByRole("radio", { name: zh ? "历史文件" : "Historical files" }),
    );
    await act(async () => reject(new Error("interrupted upload")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("radio", { name: zh ? "历史文件" : "Historical files" }),
    ).toBeChecked();
  },
);

it.each<[AssetKind, string]>([
  ["config", ".yaml"],
  ["msa", ".csv"],
  ["template", ".hhr"],
  ["measurements", ".csv"],
])(
  "preserves the bare %s upload and caller-specific %s format",
  async (kind, suffix) => {
    const asset = {
      ...uploaded,
      kind,
      suffix,
      name: "research-input" + suffix,
      size: 12,
    };
    const callback = vi.fn(),
      upload = vi.spyOn(api, "upload").mockResolvedValue(asset),
      user = userEvent.setup();
    function Input() {
      const [value, change] = useState("");
      return (
        <AssetPicker
          kind={kind}
          language="en"
          label="Attachment"
          value={value}
          onChange={change}
          allowedSuffixes={[suffix]}
          showHistory={false}
          maxBytes={16}
          onSelectedAsset={callback}
        />
      );
    }
    render(<Input />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await user.upload(
      screen.getByLabelText("Upload Attachment"),
      new File(["payload"], asset.name),
    );
    await waitFor(() => expect(callback).toHaveBeenLastCalledWith(asset));
    expect(upload).toHaveBeenCalledWith(expect.any(File), kind);
  },
);

it.each(["en", "zh"] as const)(
  "does not select a late upload after entering historical files (%s)",
  async (language) => {
    const finish = pendingUpload(),
      user = userEvent.setup(),
      zh = language === "zh";
    render(<Editor language={language} />);
    await user.upload(
      screen.getByLabelText((zh ? "上传 " : "Upload ") + "Receptor"),
      new File(["ATOM"], uploaded.name),
    );
    await user.click(
      screen.getByText(zh ? "历史文件" : "Historical files", {}),
    );
    await screen.findByRole("option", { name: historical.name });
    await finish();
    expect(screen.getByLabelText("Current input")).toHaveTextContent("None");
  },
);
