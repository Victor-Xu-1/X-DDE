import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AlignmentResults } from "./AlignmentResults";
vi.mock("./AlignmentCanvas", () => ({
  default: ({
    data,
  }: {
    data: { rows: number; columns: number; fasta: string };
  }) => (
    <div aria-label="Native alignment canvas">
      {data.rows} × {data.columns}
      <pre>{data.fasta}</pre>
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture(text: string, artifact = "non_pairing.a3m") {
  const bytes = new TextEncoder().encode(text);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    artifact,
    sha256: hash,
    bytes: bytes.length,
    rows: artifact === "pairing.a3m" ? 1 : 2,
    columns: 4,
  };
}
const unpaired = ">query\nACDE\n>homologue\nA-DE\n",
  paired = ">query\nACDE\n";
it("loads complete native bytes, switches paired/unpaired and keeps original downloads", async () => {
  const files = await Promise.all([
    fixture(unpaired),
    fixture(paired, "pairing.a3m"),
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(url.includes("non_pairing") ? unpaired : paired),
    ),
  );
  render(
    <AlignmentResults
      jobId="native"
      files={files}
      query="ACDE"
      language="en"
    />,
  );
  await screen.findByText("2 × 4");
  expect(
    screen.getByRole("link", { name: "Download complete alignment · A3M" }),
  ).toHaveAttribute("href", "/api/jobs/native/download?name=non_pairing.a3m");
  await userEvent
    .setup()
    .selectOptions(
      screen.getByRole("combobox", { name: "Alignment" }),
      "pairing.a3m",
    );
  await screen.findByText("1 × 4");
  expect(screen.queryByText("2 × 4")).toBeNull();
});
it("rejects changed native bytes and recovers only after an explicit retry", async () => {
  const file = await fixture(unpaired);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(unpaired.replace("A-DE", "ACDE")))
    .mockResolvedValueOnce(new Response(unpaired));
  vi.stubGlobal("fetch", fetcher);
  render(
    <AlignmentResults
      jobId="native"
      files={[file]}
      query="ACDE"
      language="en"
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Alignment preview unavailable",
  );
  expect(screen.queryByLabelText("Native alignment canvas")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry preview" }));
  await screen.findByText("2 × 4");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("aborts old task work and ignores a late response after switching tasks", async () => {
  const file = await fixture(unpaired),
    requests: { signal: AbortSignal; resolve: (value: Response) => void }[] =
      [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise<Response>((resolve) =>
          requests.push({ signal: options.signal, resolve }),
        ),
    ),
  );
  const view = render(
    <AlignmentResults jobId="old" files={[file]} query="ACDE" language="en" />,
  );
  await waitFor(() => expect(requests).toHaveLength(1));
  view.rerender(
    <AlignmentResults jobId="new" files={[file]} query="ACDE" language="en" />,
  );
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0].signal.aborted).toBe(true);
  await act(async () => requests[1].resolve(new Response(unpaired)));
  await screen.findByText("2 × 4");
  await act(async () => requests[0].resolve(new Response("wrong source")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Download complete alignment · A3M" }),
  ).toHaveAttribute("href", "/api/jobs/new/download?name=non_pairing.a3m");
});
