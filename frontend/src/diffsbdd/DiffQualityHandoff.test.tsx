import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DiffResults } from "./DiffResults";
import { api } from "../api";
import * as client from "../api";
import type { Job } from "../types";
import { artifactInfo } from "../presentation/artifact-digest";
import { readArtifactFile } from "../presentation/artifact-file";

vi.mock("../presentation/artifact-digest", () => ({
  artifactInfo: vi.fn(async () => ({ sha256: "a".repeat(64), records: 2 })),
}));
vi.mock("../presentation/artifact-file", () => ({
  readArtifactFile: vi.fn(async () => ({
    sha256: "b".repeat(64),
    bytes: new Uint8Array([1]),
  })),
}));
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: () => <span>Retained molecular preview</span>,
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <span>Retained molecular drawing</span>,
}));
vi.mock("../quality/QualityForm", () => ({
  QualityForm: (props: unknown) => (
    <output data-testid="quality-input">{JSON.stringify(props)}</output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(artifactInfo)
    .mockReset()
    .mockResolvedValue({
      sha256: "a".repeat(64),
      records: 2,
    });
  vi.mocked(readArtifactFile)
    .mockReset()
    .mockResolvedValue({ sha256: "b".repeat(64), bytes: new Uint8Array([1]) });
});

it("uses the actual native receptor when it differs from the submitted input", async () => {
  const user = userEvent.setup();
  const native = {
    asset_id: "native-receptor",
    sha256: "c".repeat(64),
    record: 0,
    conformer: 0,
    version_id: "native-version",
  };
  vi.mocked(readArtifactFile).mockResolvedValue({
    sha256: native.sha256,
    bytes: new Uint8Array([1]),
  });
  vi.spyOn(client, "request").mockResolvedValue([
    object("generation", 0),
    object("generation", 1),
    { source_job: "generation", kind: "structure", reference: native },
    {
      source_job: "generation",
      kind: "structure",
      reference: { ...native, sha256: "d".repeat(64), asset_id: "pocket" },
    },
  ] as never);
  render(<DiffResults {...props("generation")} />);
  const button = await screen.findByRole("button", {
    name: "Check this candidate's pose quality",
  });
  await user.click(button);
  expect(
    JSON.parse(screen.getByTestId("quality-input").textContent!),
  ).toMatchObject({
    initialMolecule: reference("generation", 0),
    initialProtein: native,
    initialProfile: "dock",
  });
});

it("never substitutes the original input when the native receptor is unregistered", async () => {
  const user = userEvent.setup();
  vi.mocked(readArtifactFile).mockResolvedValue({
    sha256: "c".repeat(64),
    bytes: new Uint8Array([1]),
  });
  vi.spyOn(client, "request").mockResolvedValue([
    object("generation", 0),
    object("generation", 1),
  ] as never);
  render(<DiffResults {...props("generation")} />);
  await screen.findByText(/receptor used for generation has not been verified/);
  await user.click(
    screen.getByRole("button", { name: "Check this candidate's pose quality" }),
  );
  expect(
    JSON.parse(screen.getByTestId("quality-input").textContent!),
  ).toMatchObject({
    initialMolecule: reference("generation", 0),
    initialProtein: null,
    initialProfile: "dock",
  });
});

it("prepares the exact native receptor if the molecule was already registered", async () => {
  const user = userEvent.setup();
  const native = {
    asset_id: "native-receptor",
    sha256: "c".repeat(64),
    record: 0,
    conformer: 0,
    version_id: "native-version",
  };
  vi.mocked(readArtifactFile).mockResolvedValue({
    sha256: native.sha256,
    bytes: new Uint8Array([1]),
  });
  let indexed = false;
  vi.spyOn(client, "request").mockImplementation(
    async () =>
      [
        object("generation", 0),
        object("generation", 1),
        ...(indexed
          ? [{ source_job: "generation", kind: "structure", reference: native }]
          : []),
      ] as never,
  );
  vi.spyOn(api, "post").mockImplementation(async () => {
    indexed = true;
    return {} as never;
  });
  render(<DiffResults {...props("generation")} />);
  await screen.findByText(/receptor used for generation has not been verified/);
  await user.click(
    screen.getByRole("button", { name: "Prepare for follow-up" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText(/receptor used for generation has not been verified/),
    ).toBeNull(),
  );
  await user.click(
    screen.getByRole("button", { name: "Check this candidate's pose quality" }),
  );
  expect(
    JSON.parse(screen.getByTestId("quality-input").textContent!),
  ).toMatchObject({ initialProtein: native, initialProfile: "dock" });
});

it("rejects a receptor that changes while research materials are being prepared", async () => {
  const user = userEvent.setup();
  vi.mocked(readArtifactFile)
    .mockResolvedValueOnce({
      sha256: "b".repeat(64),
      bytes: new Uint8Array([1]),
    })
    .mockResolvedValueOnce({
      sha256: "c".repeat(64),
      bytes: new Uint8Array([2]),
    });
  vi.spyOn(client, "request").mockResolvedValue([] as never);
  vi.spyOn(api, "post").mockResolvedValue({} as never);
  render(<DiffResults {...props("generation")} />);
  await user.click(
    await screen.findByRole("button", { name: "Prepare for follow-up" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "original receptor file changed",
  );
  expect(
    screen.queryByRole("button", {
      name: "Check this candidate's pose quality",
    }),
  ).toBeNull();
});

const protein = {
  asset_id: "protein",
  sha256: "b".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "source-receptor",
};
const reference = (job: string, record: number) => ({
  asset_id: job + "-file",
  sha256: "a".repeat(64),
  record,
  conformer: 0,
  version_id: job + "-" + record,
});
const object = (job: string, record: number) => ({
  id: job + "-" + record,
  kind: "molecule",
  source_job: job,
  reference: reference(job, record),
});
const props = (job: string) => ({
  job: {
    id: job,
    request: { operation: "diffsbdd", payload: { mode: "generate", protein } },
  } as unknown as Job,
  data: {
    operation: "diffsbdd",
    complete: true,
    valid: 2,
    molecule_artifact: "molecules.sdf",
    protein_artifact: "protein.pdb",
  } as const,
  language: "en" as const,
});

it("prepares missing native materials through the existing API, retries safely and keeps the selected record", async () => {
  const user = userEvent.setup();
  let prepared = false;
  vi.spyOn(client, "request").mockImplementation(
    async () =>
      (prepared
        ? [object("generation", 0), object("generation", 1)]
        : []) as never,
  );
  const prepare = vi
    .spyOn(api, "post")
    .mockRejectedValueOnce(new Error("connection interrupted"))
    .mockImplementationOnce(async () => {
      prepared = true;
      return {} as never;
    });
  const submit = vi.spyOn(api, "submit");
  render(<DiffResults {...props("generation")} />);
  await user.click(await screen.findByRole("button", { name: "Candidate 2" }));
  expect(
    screen.queryByRole("button", {
      name: "Check this candidate's pose quality",
    }),
  ).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Prepare for follow-up" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Research inputs could not be prepared",
  );
  await user.click(
    screen.getByRole("button", { name: "Prepare for follow-up" }),
  );
  await user.click(
    await screen.findByRole("button", {
      name: "Check this candidate's pose quality",
    }),
  );
  expect(
    JSON.parse(screen.getByTestId("quality-input").textContent!),
  ).toMatchObject({
    initialMolecule: reference("generation", 1),
    initialProtein: protein,
  });
  expect(prepare.mock.calls.map((call) => call[0])).toEqual([
    "/jobs/generation/index-assets",
    "/jobs/generation/index-assets",
  ]);
  expect(submit).not.toHaveBeenCalled();
});

it("does not let a late material registration replace another task's selected input", async () => {
  const user = userEvent.setup();
  let finish!: (value: unknown) => void;
  vi.spyOn(api, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.includes("source_job=other")
        ? [object("other", 0), object("other", 1)]
        : []) as never,
  );
  const result = render(<DiffResults {...props("generation")} />);
  await user.click(await screen.findByRole("button", { name: "Candidate 2" }));
  await user.click(
    screen.getByRole("button", { name: "Prepare for follow-up" }),
  );
  result.rerender(<DiffResults {...props("other")} />);
  await screen.findByRole("button", {
    name: "Check this candidate's pose quality",
  });
  await act(async () => {
    finish({});
  });
  await user.click(
    screen.getByRole("button", { name: "Check this candidate's pose quality" }),
  );
  expect(
    JSON.parse(screen.getByTestId("quality-input").textContent!),
  ).toMatchObject({ initialMolecule: reference("other", 0) });
});

it("rejects a native file changed during material registration and exposes no reusable candidate", async () => {
  const user = userEvent.setup();
  vi.spyOn(client, "request").mockResolvedValue([] as never);
  vi.spyOn(api, "post").mockResolvedValue({} as never);
  vi.mocked(artifactInfo)
    .mockResolvedValueOnce({ sha256: "a".repeat(64), records: 2 })
    .mockResolvedValueOnce({ sha256: "c".repeat(64), records: 2 });
  render(<DiffResults {...props("generation")} />);
  await user.click(
    await screen.findByRole("button", { name: "Prepare for follow-up" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "original molecular file changed",
  );
  expect(
    screen.queryByRole("button", {
      name: "Check this candidate's pose quality",
    }),
  ).toBeNull();
  expect(
    screen.queryByRole("table", { name: "Generated candidate molecules" }),
  ).toBeNull();
});

it.each(["en", "zh"] as const)(
  "opens quality review for exactly the selected candidate and source receptor without submitting in %s",
  async (language) => {
    const user = userEvent.setup();
    const protein = {
      asset_id: "protein",
      sha256: "b".repeat(64),
      record: 0,
      conformer: 0,
      version_id: "exact-receptor",
    };
    const refs = [0, 1].map((record) => ({
      asset_id: "same-native-file",
      sha256: "a".repeat(64),
      record,
      conformer: 0,
      version_id: `original-${record}`,
    }));
    vi.spyOn(client, "request").mockResolvedValue(
      refs.map((reference) => ({
        id: reference.version_id,
        kind: "molecule",
        source_job: "generation",
        reference,
      })) as never,
    );
    const submit = vi.spyOn(api, "submit");
    render(
      <DiffResults
        job={
          {
            id: "generation",
            request: {
              operation: "diffsbdd",
              payload: { mode: "generate", protein },
            },
          } as unknown as Job
        }
        data={{
          operation: "diffsbdd",
          complete: true,
          valid: 2,
          molecule_artifact: "molecules.sdf",
          protein_artifact: "protein.pdb",
        }}
        language={language}
      />,
    );
    await user.click(
      await screen.findByRole("button", {
        name: language === "en" ? "Candidate 2" : "候选 2",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name:
          language === "en"
            ? "Check this candidate's pose quality"
            : "检查这个候选的姿势质量",
      }),
    );
    expect(
      JSON.parse(screen.getByTestId("quality-input").textContent!),
    ).toMatchObject({ initialMolecule: refs[1], initialProtein: protein });
    await user.click(
      screen.getByRole("button", { name: /Back to results|返回结果/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: language === "en" ? "Candidate 2" : "候选 2",
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(submit).not.toHaveBeenCalled();
  },
);
