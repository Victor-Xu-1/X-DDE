import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AssetPicker } from "./AssetPicker";
import type { Asset } from "./types";
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
      screen.getByText(zh ? "历史文件" : "Historical files", { exact: true }),
    );
    await screen.findByRole("option", { name: historical.name, exact: true });
    const picker = screen.getByRole("combobox", {
      name: "Receptor",
      exact: true,
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
      screen.getByText(zh ? "历史文件" : "Historical files", { exact: true }),
    );
    await screen.findByRole("option", { name: historical.name, exact: true });
    await finish();
    expect(screen.getByLabelText("Current input")).toHaveTextContent("None");
  },
);
