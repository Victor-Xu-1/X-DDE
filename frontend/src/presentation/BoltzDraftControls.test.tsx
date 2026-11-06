import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import {
  boltzDraftAdapter,
  readBoltzDraft,
  type BoltzDraftState,
} from "../integrations/boltz-draft";
import { draftFingerprint } from "./prediction-draft-model";
import { SharedPredictionDraftControls } from "./SharedPredictionDraftControls";
import { SharedPredictionDraftList } from "./PredictionDraftList";

vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...real,
    request: vi.fn(),
    api: { ...real.api, authorized: vi.fn(), post: vi.fn() },
  };
});
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const state = (): BoltzDraftState => ({
  name: "STAT6 unfinished complex",
  expert: true,
  components: [
    {
      id: "STAT6",
      kind: "protein",
      value: ">P42226\nMSLWGLVSKMPPEK",
      msa_mode: "provided",
    },
    {
      id: "B",
      kind: "ligand",
      value: "",
      source: {
        asset_id: "11111111-1111-4111-8111-111111111111",
        sha256: "a".repeat(64),
        record: 2,
        conformer: 0,
      },
    },
  ],
  settings: {
    kind: "boltz",
    samples: 0,
    recycling_steps: -1,
    sampling_steps: 200,
    affinity: true,
  },
  options: { device: "cuda", cpu: 0, memory_mib: 0, seed: -1 },
});
function draft(value = state(), id = "00000000-0000-4000-8000-000000000001") {
  return {
    id,
    tool: "boltz.predict" as const,
    schema_version: 1 as const,
    revision: 1,
    name: value.name,
    entities: value.components.length,
    state: value,
    archived: false,
    created_at: "2026-11-06T00:00:00Z",
    updated_at: "2026-11-06T00:00:00Z",
  };
}
const props = () => ({
  adapter: boltzDraftAdapter,
  state: state(),
  initial: null,
  language: "en" as const,
  busy: false,
  onName: vi.fn(),
  onResume: vi.fn(),
});

it("saves unfinished Boltz fields and exact nested references through its own engine route", async () => {
  const current = state();
  vi.mocked(api.authorized).mockImplementation(async (path, init) => {
    const sent = JSON.parse(String(init?.body));
    expect(path).toMatch(/\/prediction-drafts\/[^?]+\?tool=boltz.predict$/);
    expect(sent).toEqual({
      tool: "boltz.predict",
      schema_version: 1,
      revision: 0,
      state: current,
    });
    return draft(
      {
        ...sent.state,
        components: sent.state.components.map((row: object) => ({
          ...row,
          msa: null,
        })),
      },
      path.split("/").pop()!.split("?")[0],
    ) as never;
  });
  render(<SharedPredictionDraftControls {...props()} state={current} />);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    await screen.findByText("Saved · Not submitted", { exact: true }),
  ).toBeVisible();
  expect(api.authorized).toHaveBeenCalledTimes(1);
});

it("keeps the same draft target after a wrong-identity save response", async () => {
  vi.mocked(api.authorized).mockResolvedValue(draft() as never);
  render(<SharedPredictionDraftControls {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "does not match this draft",
  );
  const first = vi.mocked(api.authorized).mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.authorized).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.authorized).mock.calls[1][0]).toBe(first[0]);
  expect(
    JSON.parse(String(vi.mocked(api.authorized).mock.calls[1][1]?.body))
      .revision,
  ).toBe(0);
});

it("does not accept another engine's list or replace current inputs", async () => {
  vi.mocked(request).mockResolvedValue([{ ...draft(), tool: "mol1.predict" }]);
  const onResume = vi.fn();
  render(
    <SharedPredictionDraftList
      adapter={boltzDraftAdapter}
      language="en"
      busy={false}
      onResume={onResume}
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "another prediction model",
  );
  expect(request).toHaveBeenCalledWith(
    "/prediction-drafts?archived=false&offset=0&tool=boltz.predict",
    expect.anything(),
  );
  expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  expect(onResume).not.toHaveBeenCalled();
});

it("requires explicit confirmation and the same source-bound Boltz draft before resume", async () => {
  const loaded = draft();
  vi.mocked(request).mockImplementation(async (path) =>
    path.includes("?archived=") ? [loaded] : loaded,
  );
  const onResume = vi.fn(),
    user = userEvent.setup();
  render(
    <SharedPredictionDraftList
      adapter={boltzDraftAdapter}
      language="en"
      busy={false}
      onResume={onResume}
      onClose={vi.fn()}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Resume" }));
  expect(onResume).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Resume this draft" }));
  await waitFor(() => expect(onResume).toHaveBeenCalledWith(loaded));
  expect(request).toHaveBeenLastCalledWith(
    `/prediction-drafts/${loaded.id}?tool=boltz.predict`,
  );
});

it("refuses replacement when the mounted form changes while drafts are open", async () => {
  const loaded = draft(),
    user = userEvent.setup(),
    p = props();
  vi.mocked(request).mockImplementation(async (path) =>
    path.includes("?archived=") ? [loaded] : loaded,
  );
  const view = render(<SharedPredictionDraftControls {...p} />);
  await user.click(screen.getByRole("button", { name: "Open drafts" }));
  await user.click(await screen.findByRole("button", { name: "Resume" }));
  view.rerender(
    <SharedPredictionDraftControls
      {...p}
      state={{ ...p.state, name: "new unsaved input" }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Resume this draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Inputs changed");
  expect(p.onResume).not.toHaveBeenCalled();
});

it("normalizes only absent optional reference metadata without losing actual versions or records", () => {
  const original = state(),
    returned = structuredClone(original);
  returned.components[1].source!.version_id = null;
  returned.components[1].msa = null;
  expect(draftFingerprint(returned)).toBe(draftFingerprint(original));
  returned.components[1].source!.record = 3;
  expect(draftFingerprint(returned)).not.toBe(draftFingerprint(original));
});

it.each([
  () => ({ ...state(), verified: true }),
  () => ({
    ...state(),
    components: [{ ...state().components[0], value: "A".repeat(50001) }],
  }),
  () => ({ ...state(), options: { ...state().options, seed: NaN } }),
  () => ({
    ...state(),
    components: [
      {
        ...state().components[1],
        source: { ...state().components[1].source, sha256: "wrong" },
      },
    ],
  }),
])("rejects unsupported or unsafe snapshot shapes before any save", (value) => {
  expect(() => readBoltzDraft(value())).toThrow("cannot be opened safely");
});
