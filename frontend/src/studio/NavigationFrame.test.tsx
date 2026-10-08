import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Navigation } from "./Navigation";

let compact = true;
let resize: (() => void) | undefined;
beforeEach(() => {
  compact = true;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return compact;
    },
    addEventListener: (_: string, listener: () => void) => {
      resize = listener;
    },
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resize = undefined;
});

it("keeps full navigation in a closed modal until requested, then closes before changing the destination", async () => {
  const user = userEvent.setup(),
    onView = vi.fn();
  render(<Navigation view="home" onView={onView} language="en" jobs={[]} />);
  expect(screen.queryByRole("navigation")).toBeNull();
  const trigger = screen.getByRole("button", {
    name: "Open research navigation",
  });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Research navigation" });
  expect(
    within(dialog).getByRole("button", { name: "High-throughput screening" }),
  ).toBeVisible();
  await user.click(
    within(dialog).getByRole("button", { name: "High-throughput screening" }),
  );
  expect(onView).toHaveBeenCalledWith("drugclip.screen");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});

it("responds to native cancellation and viewport changes without leaving hidden focus targets", async () => {
  const user = userEvent.setup();
  render(<Navigation view="home" onView={vi.fn()} language="zh" jobs={[]} />);
  await user.click(screen.getByRole("button", { name: "打开研究导航" }));
  const dialog = screen.getByRole("dialog", { name: "研究导航" });
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  act(() => (dialog as HTMLDialogElement).close());
  expect(screen.getByRole("button", { name: "打开研究导航" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  act(() => {
    compact = false;
    resize?.();
  });
  expect(screen.getByRole("navigation", { name: "主导航" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "打开研究导航" })).toBeNull();
  act(() => {
    compact = true;
    resize?.();
  });
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.getByRole("button", { name: "打开研究导航" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
