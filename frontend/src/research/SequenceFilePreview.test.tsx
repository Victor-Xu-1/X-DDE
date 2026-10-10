import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as source from "./fasta-file";
import { SequenceFilePreview } from "./SequenceFilePreview";

afterEach(() => vi.restoreAllMocks());
const reference = {
  asset_id: "stat6",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
it("jumps to exact positions in a long retained sequence and resets when changing records", async () => {
  vi.spyOn(source, "readSequenceFile").mockResolvedValue([
    { header: "STAT6 P42226", sequence: "M" + "A".repeat(846) },
    { header: "STAT6 construct", sequence: "mAcX-?" },
  ]);
  const user = userEvent.setup();
  render(<SequenceFilePreview reference={reference} language="en" />);
  expect(await screen.findByText("847 positions")).toBeVisible();
  const input = screen.getByRole("spinbutton", { name: "Go to position" });
  await user.type(input, "847{Enter}");
  expect(screen.getByText("Sequence position 847 · A")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "STAT6 P42226 · 847 A" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    document.querySelectorAll(".sequence-residue-grid button").length,
  ).toBeLessThanOrEqual(600);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Sequence record" }),
    "1",
  );
  expect(
    screen.getByRole("heading", { name: "STAT6 construct" }),
  ).toBeVisible();
  expect(screen.queryByText("Sequence position 847 · A")).toBeNull();
  expect(
    screen.getByRole("button", { name: "STAT6 construct · 1 m" }),
  ).toBeVisible();
});
it("does not apply a late file response to a newer selected version", async () => {
  let resolve!: (value: source.FastaRecord[]) => void;
  vi.spyOn(source, "readSequenceFile")
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce([{ header: "Current", sequence: "AcX" }]);
  const view = render(
    <SequenceFilePreview reference={reference} language="en" />,
  );
  view.rerender(
    <SequenceFilePreview
      reference={{ ...reference, asset_id: "second" }}
      language="en"
    />,
  );
  expect(await screen.findByRole("heading", { name: "Current" })).toBeVisible();
  await act(async () => resolve([{ header: "Old", sequence: "AAAA" }]));
  expect(screen.queryByRole("heading", { name: "Old" })).toBeNull();
});
it("keeps failures concise and supports a real retry without showing partial data", async () => {
  const read = vi
    .spyOn(source, "readSequenceFile")
    .mockRejectedValueOnce(new source.SequencePreviewError("format"))
    .mockResolvedValueOnce([{ header: "Verified", sequence: "AX" }]);
  const user = userEvent.setup();
  render(<SequenceFilePreview reference={reference} language="zh" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("FASTA");
  await user.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByRole("heading", { name: "Verified" }),
  ).toBeVisible();
});
