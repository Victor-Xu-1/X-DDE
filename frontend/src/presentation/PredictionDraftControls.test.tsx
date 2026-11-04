import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError, request } from "../api";
import { mol1Defaults } from "../integrations/mol1-settings";
import { PredictionDraftControls } from "./PredictionDraftControls";
import { PredictionDraftList } from "./PredictionDraftList";
import {
  draftFingerprint,
  parseSeedText,
  readMol1Draft,
  snapshotMol1Settings,
  type Mol1DraftState,
  type PredictionDraft,
} from "./prediction-draft-model";

vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...real,
    request: vi.fn(),
    api: { ...real.api, authorized: vi.fn(), post: vi.fn() },
  };
});
const originalModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
});
afterAll(() => {
  if (originalModal)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      originalModal,
    );
  else
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
      .showModal;
});
const state = (): Mol1DraftState => ({
  name: "STAT6 incomplete",
  components: [
    { kind: "protein", value: ">STAT6\nMSLWGLVSKMPPEK", count: 1 },
    { kind: "ligand", value: "", count: 1 },
  ],
  settings: snapshotMol1Settings(mol1Defaults()),
  bonds: [],
  advanced: true,
  seed_text: "101,,unfinished,",
  device: "cuda",
  memory: 0,
  seed: -1,
});
const draft = (value = state()): PredictionDraft => ({
  id: "00000000-0000-4000-8000-000000000001",
  revision: 1,
  tool: "mol1.predict",
  schema_version: 1,
  name: value.name,
  entities: value.components.length,
  archived: false,
  state: value,
  created_at: "2026-11-04T00:00:00Z",
  updated_at: "2026-11-04T00:00:00Z",
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("preserves unfinished text and rejects incompatible/corrupt editor shapes", () => {
  expect(readMol1Draft(state()).seed_text).toBe("101,,unfinished,");
  expect(parseSeedText("101,,unfinished,")).toEqual([101, NaN, NaN, NaN]);
  for (const value of [
    { ...state(), components: [{ kind: "invalid" }] },
    { ...state(), settings: { ...state().settings, dtype: "unknown" } },
    { ...state(), seed: NaN },
    { ...state(), bonds: [{}] },
  ])
    expect(() => readMol1Draft(value)).toThrow("current inputs were retained");
  expect(draftFingerprint({ a: 1, b: 2 })).toBe(
    draftFingerprint({ b: 2, a: 1 }),
  );
  expect(
    snapshotMol1Settings({
      ...mol1Defaults(),
      components: [],
      additional_seeds: [NaN],
    }),
  ).not.toHaveProperty("components");
  expect(snapshotMol1Settings(mol1Defaults())).not.toHaveProperty(
    "additional_seeds",
  );
});

it.each(["en", "zh"] as const)(
  "normalizes No-MSA null references when saving unfinished values and still detects later edits in %s",
  async (language) => {
    const user = userEvent.setup(),
      zh = language === "zh",
      value = state();
    value.components[0] = {
      ...value.components[0],
      paired_msa: null,
      unpaired_msa: null,
      template_hits: null,
    };
    vi.mocked(api.authorized).mockResolvedValue(draft());
    const props = {
      state: value,
      initial: null,
      language,
      busy: false,
      onName: vi.fn(),
      onResume: vi.fn(),
    };
    const view = render(<PredictionDraftControls {...props} />);
    await user.click(
      screen.getByRole("button", {
        name: zh ? "保存草稿" : "Save draft",
      }),
    );
    await screen.findByText(zh ? "已保存 · 尚未提交" : "Saved · Not submitted");
    const [path, init] = vi.mocked(api.authorized).mock.calls[0];
    expect(path).toMatch(/^\/prediction-drafts\/[0-9a-f-]+$/);
    expect(JSON.parse(String(init.body))).toMatchObject({
      revision: 0,
      state: { seed_text: "101,,unfinished,", seed: -1, memory: 0 },
    });
    view.rerender(
      <PredictionDraftControls
        {...props}
        state={{ ...value, name: "Changed after save" }}
      />,
    );
    expect(
      screen.getByText(zh ? "当前修改尚未保存" : "Current edits are not saved"),
    ).toBeVisible();
  },
);

it("retains a failed create identity for safe retry and offers save-copy on conflict", async () => {
  const user = userEvent.setup();
  vi.mocked(api.authorized)
    .mockRejectedValueOnce(new TypeError("Response lost"))
    .mockRejectedValueOnce(new ApiError(409, "Changed elsewhere"));
  render(
    <PredictionDraftControls
      state={state()}
      initial={null}
      language="en"
      busy={false}
      onName={vi.fn()}
      onResume={vi.fn()}
    />,
  );
  const save = screen.getByRole("button", { name: "Save draft" });
  await user.click(save);
  await screen.findByRole("alert");
  await user.click(save);
  await screen.findByText(/changed in another page/);
  expect(vi.mocked(api.authorized).mock.calls[0][0]).toBe(
    vi.mocked(api.authorized).mock.calls[1][0],
  );
  expect(screen.getByRole("button", { name: "Save a new copy" })).toBeEnabled();
});

it("explicitly confirms replacement, filters names, and resumes the exact loaded snapshot", async () => {
  const user = userEvent.setup(),
    onResume = vi.fn();
  vi.mocked(request).mockImplementation(async (path) =>
    path.startsWith("/prediction-drafts?") ? [draft()] : draft(),
  );
  render(
    <PredictionDraftList
      language="en"
      busy={false}
      onResume={onResume}
      onClose={vi.fn()}
    />,
  );
  await screen.findByText("STAT6 incomplete");
  await user.type(screen.getByLabelText("Search task name"), "missing");
  expect(
    screen.queryByRole("button", { name: "Resume" }),
  ).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Search task name"));
  await user.click(screen.getByRole("button", { name: "Resume" }));
  expect(onResume).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Resume this draft" }));
  await waitFor(() => expect(onResume).toHaveBeenCalledWith(draft()));
});

it("does not apply a delayed resume after closing the list", async () => {
  let resolve!: (value: PredictionDraft) => void;
  vi.mocked(request).mockImplementation(async (path) =>
    path.startsWith("/prediction-drafts?")
      ? [draft()]
      : new Promise((done) => {
          resolve = done;
        }),
  );
  const user = userEvent.setup(),
    onResume = vi.fn();
  const view = render(
    <PredictionDraftList
      language="en"
      busy={false}
      onResume={onResume}
      onClose={vi.fn()}
    />,
  );
  await screen.findByText("STAT6 incomplete");
  await user.click(screen.getByRole("button", { name: "Resume" }));
  await user.click(screen.getByRole("button", { name: "Resume this draft" }));
  view.unmount();
  resolve(draft());
  await Promise.resolve();
  expect(onResume).not.toHaveBeenCalled();
});

it("keeps inputs when a loaded draft has an unknown schema and supports recoverable archive", async () => {
  const user = userEvent.setup(),
    onResume = vi.fn();
  vi.mocked(request).mockImplementation(async (path) =>
    path.startsWith("/prediction-drafts?")
      ? [draft()]
      : { ...draft(), schema_version: 2 },
  );
  vi.mocked(api.post).mockResolvedValue({
    ...draft(),
    archived: true,
    revision: 2,
  });
  render(
    <PredictionDraftList
      language="en"
      busy={false}
      onResume={onResume}
      onClose={vi.fn()}
    />,
  );
  await screen.findByText("STAT6 incomplete");
  await user.click(screen.getByRole("button", { name: "Resume" }));
  await user.click(screen.getByRole("button", { name: "Resume this draft" }));
  await screen.findByRole("alert");
  expect(onResume).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Archive" }));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      `/prediction-drafts/${draft().id}/archive`,
      { revision: 1, archived: true },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Archived" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/prediction-drafts?archived=true&offset=0",
      expect.anything(),
    ),
  );
});
