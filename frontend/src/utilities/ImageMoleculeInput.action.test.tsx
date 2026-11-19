import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  InputActionScope,
  useInputActionScope,
} from "../guided/InputActionScope";
import { ImageMoleculeInput } from "./ImageMoleculeInput";
import type { ImageMolecule } from "./image-molecule";
import { TaskPresentationContext } from "../guided/TaskPresentation";

type Apply = (
  value: ImageMolecule,
  source: File,
  signal: AbortSignal,
) => void | Promise<void>;

const dialog = vi.hoisted(() => ({
  accept: undefined as undefined | ((...args: unknown[]) => Promise<void>),
}));
vi.mock("./ImageMoleculeDialog", () => ({
  ImageMoleculeDialog: ({
    onClose,
    onAccept,
    mode,
  }: {
    onClose(): void;
    onAccept: (...args: unknown[]) => Promise<void>;
    mode: string;
  }) => {
    dialog.accept = onAccept;
    return mode === "hidden" ? null : (
      <div role="dialog">
        <button onClick={() => onClose()}>Cancel image</button>
      </div>
    );
  },
}));
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
afterEach(() => {
  cleanup();
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  dialog.accept = undefined;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve,
  };
}
function ScopeForm({ apply = vi.fn() }: { apply?: Apply }) {
  const scope = useInputActionScope()!;
  const finish = useRef<(() => void) | null>(null);
  return (
    <>
      <button
        onClick={() => {
          finish.current = scope.begin("example");
        }}
      >
        Replace inputs
      </button>
      <button onClick={() => finish.current?.()}>Finish replacement</button>
      <fieldset disabled={scope.action === "example"}>
        <ImageMoleculeInput language="en" onMolecule={apply}>
          <textarea aria-label="SMILES" />
        </ImageMoleculeInput>
      </fieldset>
    </>
  );
}
function mount(apply?: Apply) {
  render(
    <InputActionScope>
      <ScopeForm apply={apply} />
    </InputActionScope>,
  );
}
function image() {
  return new File(["image-control-fixture"], "input.png", {
    type: "image/png",
  });
}
function drop() {
  const target = screen
    .getByRole("textbox", { name: "SMILES" })
    .closest(".image-molecule-input")!;
  fireEvent.drop(target, { dataTransfer: { files: [image()] } });
}
function clipboard(read: () => Promise<ClipboardItem[]>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { read },
  });
}
function item(
  blob: Promise<Blob> = Promise.resolve(
    new Blob(["image"], { type: "image/png" }),
  ),
) {
  return {
    types: ["image/png"],
    getType: () => blob,
  } as unknown as ClipboardItem;
}

it("rejects a div drop while replacement disables native controls", () => {
  mount();
  fireEvent.click(screen.getByText("Replace inputs"));
  drop();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByText("Finish replacement"));
  drop();
  expect(screen.getByRole("dialog")).toBeVisible();
});

it("opening the file disclosure keeps the screenshot review intact", () => {
  const onSourceEdit = vi.fn();
  render(
    <ImageMoleculeInput
      language="en"
      cancelOnEdit
      onSourceEdit={onSourceEdit}
      onMolecule={vi.fn()}
      review={{
        molecule: { smiles: "Nc1ccccc1", molfile: "M  END" },
        image: image(),
      }}
    >
      <div className="asset-picker">
        <button type="button" data-material-disclosure>
          Change file
        </button>
        <button type="button">Choose another file</button>
      </div>
    </ImageMoleculeInput>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Change file" }));
  expect(onSourceEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Choose another file" }));
  expect(onSourceEdit).toHaveBeenCalledOnce();
});

it("ignores clipboard read that crosses a complete replacement action", async () => {
  const read = deferred<ClipboardItem[]>();
  clipboard(() => read.promise);
  mount();
  fireEvent.click(screen.getByText("Paste screenshot"));
  fireEvent.click(screen.getByText("Replace inputs"));
  fireEvent.click(screen.getByText("Finish replacement"));
  await act(async () => read.resolve([item()]));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("rechecks an asynchronous clipboard blob after replacement has finished", async () => {
  const blob = deferred<Blob>();
  clipboard(async () => [item(blob.promise)]);
  mount();
  await act(async () => fireEvent.click(screen.getByText("Paste screenshot")));
  fireEvent.click(screen.getByText("Replace inputs"));
  fireEvent.click(screen.getByText("Finish replacement"));
  await act(async () =>
    blob.resolve(new Blob(["image"], { type: "image/png" })),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("does not accept an old dialog export after input replacement", async () => {
  const apply = vi.fn();
  mount(apply);
  drop();
  const old = dialog.accept!;
  fireEvent.click(screen.getByText("Replace inputs"));
  fireEvent.click(screen.getByText("Finish replacement"));
  await act(async () =>
    old({ smiles: "CC(=O)Oc1ccccc1C(=O)O", molfile: "M  END" }, image()),
  );
  expect(apply).not.toHaveBeenCalled();
});

it("aborts an in-flight image transfer when replacement begins", async () => {
  const transfer = deferred<void>();
  const apply = vi.fn(
    (_value: unknown, _source: File, _signal: AbortSignal) => transfer.promise,
  );
  mount(apply);
  drop();
  const running = dialog.accept!(
    { smiles: "CC(=O)Oc1ccccc1C(=O)O", molfile: "M  END" },
    image(),
  );
  const signal = apply.mock.calls[0][2] as AbortSignal;
  fireEvent.click(screen.getByText("Replace inputs"));
  expect(signal.aborted).toBe(true);
  await act(async () => {
    transfer.resolve();
    await running;
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps dismissal usable inside an independently disabled fieldset", () => {
  function Form() {
    const [locked, setLocked] = useState(false);
    return (
      <>
        <button onClick={() => setLocked(true)}>Lock fields</button>
        <fieldset disabled={locked}>
          <ImageMoleculeInput language="en" onMolecule={vi.fn()}>
            <textarea aria-label="SMILES" />
          </ImageMoleculeInput>
        </fieldset>
      </>
    );
  }
  render(<Form />);
  drop();
  fireEvent.click(screen.getByText("Lock fields"));
  expect(screen.getByText("Cancel image")).toBeEnabled();
  fireEvent.click(screen.getByText("Cancel image"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("does not cancel the accepted upload when its own busy state disables input", async () => {
  const transfer = deferred<void>();
  let signal!: AbortSignal;
  function Form() {
    const [busy, setBusy] = useState(false);
    return (
      <ImageMoleculeInput
        language="en"
        disabled={busy}
        onMolecule={async (_value, _source, active) => {
          signal = active;
          setBusy(true);
          await transfer.promise;
          setBusy(false);
        }}
      >
        <textarea aria-label="SMILES" />
      </ImageMoleculeInput>
    );
  }
  render(<Form />);
  drop();
  let running!: Promise<void>;
  act(() => {
    running = dialog.accept!(
      { smiles: "NC(=O)c1ccccc1", molfile: "M  END" },
      image(),
    );
  });
  expect(signal.aborted).toBe(false);
  expect(screen.getByText("Input from structure image")).toBeDisabled();
  expect(screen.getByText("Cancel image")).toBeEnabled();
  await act(async () => {
    transfer.resolve();
    await running;
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Input from structure image")).toBeEnabled();
});

it("cancels the current image import when its utility becomes inactive", () => {
  const apply = vi.fn();
  const view = (active: boolean) => (
    <TaskPresentationContext.Provider
      value={{ layout: "single", active, renderResult: () => null }}
    >
      <InputActionScope>
        <ImageMoleculeInput language="en" onMolecule={apply}>
          <textarea aria-label="SMILES" />
        </ImageMoleculeInput>
      </InputActionScope>
    </TaskPresentationContext.Provider>
  );
  const { rerender } = render(view(true));
  drop();
  expect(screen.getByRole("dialog")).toBeVisible();
  rerender(view(false));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("SMILES")).toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});
