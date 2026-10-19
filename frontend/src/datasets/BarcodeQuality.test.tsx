import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BarcodeQuality } from "./BarcodeQuality";
import { downloadBlob } from "../presentation/visual-export";
import type { BarcodeCycleQuality } from "./barcode-quality";

vi.mock("../presentation/visual-export", () => ({ downloadBlob: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Native DEL006 validation: job 07e44626-842d-40a3-b74c-47b65927f7d2,
// barcode-review.json SHA256 05f774f66860ff514cd4d9546f448059929c4e7897d32cc7a6afbbf9c04dadef.
const cycle: BarcodeCycleQuality = {
  set: "DEL006_BBA",
  members: 96,
  barcodes: 96,
  valid_structures: 96,
  minimum_observed_hamming_distance: 4,
  pair_checks: 4560,
  complete_pair_review: true,
  one_error_correction_uniquely_supported: true,
};

it("shows native separation, chemical validity and complete pair coverage with a downloadable table", async () => {
  render(
    <BarcodeQuality
      jobId="native-definition"
      cycles={[
        cycle,
        { ...cycle, set: "DEL006_BBB" },
        { ...cycle, set: "DEL006_BBC" },
      ]}
      language="en"
    />,
  );
  const table = screen.getByRole("table", {
    name: "Barcode and structure checks",
  });
  const row = within(table).getByRole("row", { name: /DEL006_BBA/ });
  expect(within(row).getByRole("cell", { name: "96 / 96" })).toBeVisible();
  expect(within(row).getByRole("cell", { name: "4" })).toBeVisible();
  expect(
    within(row).getByRole("cell", { name: "4,560 / 4,560" }),
  ).toBeVisible();
  expect(within(table).getAllByText("Separated")).toHaveLength(3);
  expect(
    screen.getByText(/insertion and deletion errors are not assessed/),
  ).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Export checks" }));
  const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
  expect(blob).toBeInstanceOf(Blob);
  expect(blob.type).toBe("text/csv;charset=utf-8");
  expect(name).toBe("DEL-barcode-checks.csv");
});

it.each([
  ["missing", { set: "OLD", members: 96 }, "Not evaluated"],
  [
    "partial",
    {
      ...cycle,
      pair_checks: 100,
      complete_pair_review: false,
      one_error_correction_uniquely_supported: false,
    },
    "Review incomplete",
  ],
  [
    "close",
    {
      ...cycle,
      minimum_observed_hamming_distance: 2,
      one_error_correction_uniquely_supported: false,
    },
    "Needs review",
  ],
] as const)(
  "does not present %s evidence as successful error separation",
  (_name, data, status) => {
    render(<BarcodeQuality jobId="review" cycles={[data]} language="en" />);
    const table = screen.getByRole("table", {
      name: "Barcode and structure checks",
    });
    expect(within(table).getByText(status)).toBeVisible();
    expect(within(table).queryByText("Separated")).toBeNull();
  },
);

it("localizes the scientific scope and preserves unknown values", () => {
  render(
    <BarcodeQuality
      jobId="legacy"
      cycles={[{ set: "OLD", members: 96 }]}
      language="zh"
    />,
  );
  const table = screen.getByRole("table", { name: "条码区分与结构检查" });
  expect(within(table).getByText("未评估")).toBeVisible();
  expect(within(table).getByRole("cell", { name: "— / —" })).toBeVisible();
  expect(within(table).queryByRole("cell", { name: "0" })).toBeNull();
  expect(screen.getByText(/插入和缺失错误不在这项检查范围内/)).toBeVisible();
});
