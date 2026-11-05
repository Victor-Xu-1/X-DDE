import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PredictionFeatureSettings } from "./PredictionFeatureSettings";
import { featurePolicy, type FeaturePolicy } from "./prediction-feature-policy";

beforeEach(() => {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal)
    Object.defineProperties(proto, {
      showModal: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.setAttribute("open", "");
        },
      },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.removeAttribute("open");
        },
      },
    });
  vi.spyOn(proto, "showModal");
  vi.spyOn(proto, "close");
});
afterEach(() => vi.restoreAllMocks());
const source = {
  feature_mode: "uploaded" as const,
  use_template: true,
  use_rna_msa: false,
  allow_network: false,
};

it.each(["Cancel", "Close MSA settings", "Escape"])(
  "discards an uncommitted no-MSA choice through %s",
  async (close) => {
    const user = userEvent.setup(),
      update = vi.fn();
    render(
      <PredictionFeatureSettings
        value={source}
        onChange={update}
        language="en"
      />,
    );
    const trigger = screen.getByRole("button", { name: "MSA settings" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "MSA settings" });
    await user.click(within(dialog).getByRole("radio", { name: "No MSA" }));
    expect(update).not.toHaveBeenCalled();
    if (close === "Escape")
      fireEvent(
        dialog,
        new Event("cancel", { bubbles: true, cancelable: true }),
      );
    else await user.click(within(dialog).getByRole("button", { name: close }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  },
);

it("applies only reviewed policy and requires explicit sequence-transmission consent", async () => {
  const user = userEvent.setup(),
    update = vi.fn();
  render(
    <PredictionFeatureSettings
      value={source}
      onChange={update}
      language="en"
      hasRna
    />,
  );
  await user.click(screen.getByRole("button", { name: "MSA settings" }));
  await user.click(screen.getByRole("radio", { name: "Automatic search" }));
  const consent = screen.getByRole("checkbox", {
    name: /Allow this task to send sequences/,
  });
  expect(consent).not.toBeChecked();
  await user.click(consent);
  await user.click(screen.getByRole("checkbox", { name: "Use RNA MSAs" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({
    ...source,
    feature_mode: "search",
    allow_network: true,
    use_rna_msa: true,
  });
});

it("closes stale settings when source parameters or molecular context are replaced", async () => {
  const user = userEvent.setup(),
    update = vi.fn();
  const view = render(
    <PredictionFeatureSettings
      value={source}
      onChange={update}
      language="en"
      contextKey="STAT6-A"
    />,
  );
  await user.click(screen.getByRole("button", { name: "MSA settings" }));
  await user.click(screen.getByRole("radio", { name: "No MSA" }));
  view.rerender(
    <PredictionFeatureSettings
      value={{ ...source, feature_mode: "search" }}
      onChange={update}
      language="en"
      contextKey="STAT6-B"
    />,
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(update).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "MSA settings" }),
  ).toHaveTextContent("Automatic search");
});

it("discards settings when its mounted task step is hidden", async () => {
  const user = userEvent.setup(),
    update = vi.fn();
  const view = render(
    <fieldset>
      <PredictionFeatureSettings
        value={source}
        onChange={update}
        language="en"
      />
    </fieldset>,
  );
  await user.click(screen.getByRole("button", { name: "MSA settings" }));
  view.rerender(
    <fieldset hidden>
      <PredictionFeatureSettings
        value={source}
        onChange={update}
        language="en"
      />
    </fieldset>,
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(update).not.toHaveBeenCalled();
});

it.each(["hidden", "disabled"])(
  "rejects Save synchronously when its source becomes %s before the observer runs",
  async (attribute) => {
    const user = userEvent.setup(),
      update = vi.fn();
    render(
      <fieldset data-testid="scope">
        <PredictionFeatureSettings
          value={source}
          onChange={update}
          language="en"
        />
      </fieldset>,
    );
    await user.click(screen.getByRole("button", { name: "MSA settings" }));
    await user.click(screen.getByRole("radio", { name: "No MSA" }));
    const save = screen.getByRole("button", { name: "Save" });
    act(() => {
      screen.getByTestId("scope").setAttribute(attribute, "");
      fireEvent.click(save);
    });
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);

it("keeps dialog controls outside the task form and never submits it on Enter", async () => {
  const submit = vi.fn((event) => event.preventDefault()),
    user = userEvent.setup();
  render(
    <form onSubmit={submit}>
      <PredictionFeatureSettings
        value={source}
        onChange={vi.fn()}
        language="en"
      />
    </form>,
  );
  await user.click(screen.getByRole("button", { name: "MSA settings" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.closest("form")).toBeNull();
  await user.click(screen.getByRole("radio", { name: "Automatic search" }));
  await user.keyboard("{Enter}");
  expect(submit).not.toHaveBeenCalled();
  expect(dialog).toBeInTheDocument();
});

it("preserves unrelated current setup when saving an explicit no-MSA policy", async () => {
  function Host() {
    const [value, setValue] = useState<FeaturePolicy & { cycles: number }>({
      ...source,
      cycles: 10,
    });
    return (
      <>
        <PredictionFeatureSettings
          value={value}
          language="en"
          onChange={(policy) =>
            setValue((previous) => ({ ...previous, ...policy }))
          }
        />
        <output>{JSON.stringify(value)}</output>
      </>
    );
  }
  const user = userEvent.setup();
  render(<Host />);
  await user.click(screen.getByRole("button", { name: "MSA settings" }));
  await user.click(screen.getByRole("radio", { name: "No MSA" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({
    ...featurePolicy({ feature_mode: "none" }),
    cycles: 10,
  });
});
