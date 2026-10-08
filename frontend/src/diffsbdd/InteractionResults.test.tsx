import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ScientificDetails } from "./ScientificDetails";
import type { Job } from "../types";
import type { OperationResult } from "../operations/types";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: unknown) => (
    <output data-testid="contact-scene">{JSON.stringify(props)}</output>
  ),
}));
afterEach(cleanup);
const reference = (id: string) => ({
  asset_id: id,
  record: 0,
  conformer: 0,
  sha256: "a".repeat(64),
  version_id: id + "-version",
});
const job = {
  id: "native-contacts",
  request: {
    operation: "diffsbdd",
    payload: {
      mode: "interactions",
      protein: reference("protein"),
      molecule: reference("ligand"),
    },
  },
} as unknown as Job;
const data = {
  mode: "interactions",
  engine: "ProLIF",
  interactions: [
    {
      label: "配体受氢",
      kind: "hydrogen_bond",
      residue: { chain: "A", name: "ASN", number: 140, insertion_code: "B" },
      distance: 3.49123456,
      occurrences: 1,
    },
  ],
} as unknown as OperationResult;
const props = () =>
  JSON.parse(screen.getByTestId("contact-scene").textContent!);

it("selects a true residue including insertion code and preserves the paired original sources", async () => {
  const user = userEvent.setup();
  render(<ScientificDetails job={job} data={data} language="en" />);
  expect(props()).toMatchObject({
    urls: ["/api/assets/protein", "/api/assets/ligand"],
    records: [0, 0],
    focusModel: 1,
  });
  const button = screen.getByRole("button", { name: "A:ASN140B" });
  await user.click(button);
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(props().focusResidue).toEqual({ residue: "A:ASN140B", nonce: 1 });
  expect(screen.getByTitle("3.49123456")).toHaveTextContent("3.49");
  expect(screen.getByText("Hydrogen bond")).toBeVisible();
});
it("resets a chosen residue when the displayed scientific job changes", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <ScientificDetails job={job} data={data} language="zh" />,
  );
  await user.click(screen.getByRole("button", { name: "A:ASN140B" }));
  rerender(
    <ScientificDetails
      job={{ ...job, id: "another-native-job" }}
      data={data}
      language="zh"
    />,
  );
  expect(props().focusResidue).toBeNull();
});
it("keeps the chemical table available without pretending an unsupported conformer can be located", () => {
  const unsupported = {
    ...job,
    request: {
      ...job.request,
      payload: {
        ...(job.request.operation === "diffsbdd" ? job.request.payload : {}),
        protein: { ...reference("protein"), conformer: 1 },
      },
    },
  } as Job;
  render(<ScientificDetails job={unsupported} data={data} language="en" />);
  expect(screen.getByRole("button", { name: "A:ASN140B" })).toBeDisabled();
  expect(screen.queryByTestId("contact-scene")).not.toBeInTheDocument();
  expect(
    screen.getByRole("table", { name: "Residue chemical contacts" }),
  ).toBeVisible();
});
