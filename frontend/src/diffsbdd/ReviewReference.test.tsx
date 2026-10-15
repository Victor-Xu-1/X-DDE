import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewReference } from "./ReviewReference";

afterEach(() => vi.restoreAllMocks());
const reference = {
  asset_id: "first",
  sha256: "a".repeat(64),
  record: 2,
  conformer: 1,
};
const metadata = (id: string, name: string, sha256 = reference.sha256) =>
  new Response(
    JSON.stringify({
      id,
      name,
      kind: "ligand",
      suffix: ".sdf",
      size: 1234,
      sha256,
    }),
  );

it("confirms a filename against the exact digest and keeps native download and record/conformer identity", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    metadata("first", "STAT6 study.sdf"),
  );
  render(<ReviewReference reference={reference} kind="ligand" language="en" />);
  const link = await screen.findByRole("link", { name: "STAT6 study.sdf" });
  expect(link).toHaveAttribute("href", "/api/assets/first");
  expect(link).toHaveAttribute("download");
  expect(screen.getByText(/Record 3.*Conformer 2/)).toBeVisible();
});

it("clears an old filename immediately and ignores a late previous response after selection changes", async () => {
  let oldResponse!: (value: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation((raw) =>
    String(raw).includes("/first/")
      ? new Promise((resolve) => {
          oldResponse = resolve;
        })
      : Promise.resolve(
          metadata("second", "Current source.sdf", "b".repeat(64)),
        ),
  );
  const { rerender } = render(
    <ReviewReference reference={reference} kind="ligand" language="en" />,
  );
  await waitFor(() => expect(oldResponse).toBeDefined());
  rerender(
    <ReviewReference
      reference={{
        ...reference,
        asset_id: "second",
        sha256: "b".repeat(64),
        record: 4,
      }}
      kind="ligand"
      language="en"
    />,
  );
  await screen.findByRole("link", { name: "Current source.sdf" });
  await act(async () => oldResponse(metadata("first", "Old source.sdf")));
  expect(screen.queryByText("Old source.sdf")).toBeNull();
  expect(screen.getByText(/Record 5/)).toBeVisible();
});

it.each(["en", "zh"] as const)(
  "does not display a mismatched file as the selected source in %s",
  async (language) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      metadata("first", "Wrong file.sdf", "b".repeat(64)),
    );
    render(
      <ReviewReference
        reference={reference}
        kind="ligand"
        language={language}
      />,
    );
    await screen.findByRole("link", {
      name:
        language === "en"
          ? "Filename unavailable · download to check"
          : "文件名暂不可用 · 下载核对",
    });
    expect(screen.queryByText("Wrong file.sdf")).toBeNull();
  },
);
