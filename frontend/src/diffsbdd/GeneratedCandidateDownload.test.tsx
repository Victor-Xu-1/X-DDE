import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readArtifactFile } from "../presentation/artifact-file";
import { downloadBlob } from "../presentation/visual-export";
import { GeneratedCandidateDownload } from "./GeneratedCandidateDownload";

vi.mock("../presentation/artifact-file", () => ({ readArtifactFile: vi.fn() }));
vi.mock("../presentation/visual-export", () => ({ downloadBlob: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const props = {
  url: "/api/jobs/generation/download?name=molecules.sdf",
  sha256: "a".repeat(64),
  language: "en" as const,
};
const label = "Download selected candidate SDF";
const bytes = new TextEncoder().encode(
  "First\nM  END\n$$$$\nSecond\nM  END\n$$$$\n",
);

it("cancels a superseded read and verifies the new selected candidate against the original digest", async () => {
  let finish: (value: { bytes: typeof bytes; sha256: string }) => void;
  vi.mocked(readArtifactFile).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <GeneratedCandidateDownload key={0} {...props} record={0} number={3} />,
  );
  fireEvent.click(screen.getByRole("button", { name: label }));
  const [, pending, limits] = vi.mocked(readArtifactFile).mock.calls[0];
  expect(limits).toMatchObject({
    sha256: props.sha256,
    maxBytes: 25 * 1024 ** 2,
  });
  view.rerender(
    <GeneratedCandidateDownload key={1} {...props} record={1} number={7} />,
  );
  expect(pending.aborted).toBe(true);
  await act(async () => finish({ bytes, sha256: props.sha256 }));
  expect(downloadBlob).not.toHaveBeenCalled();
  vi.mocked(readArtifactFile).mockResolvedValueOnce({
    bytes,
    sha256: props.sha256,
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: label })),
  );
  expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ type: "chemical/x-mdl-sdfile" }),
    "candidate-7.sdf",
  );
});

it("leaves a retryable control and saves no file after verification fails", async () => {
  vi.mocked(readArtifactFile).mockRejectedValueOnce(
    new Error("Digest mismatch"),
  );
  render(<GeneratedCandidateDownload {...props} record={1} number={2} />);
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  expect(screen.getByRole("button", { name: label })).toBeEnabled();
  expect(downloadBlob).not.toHaveBeenCalled();
});
