import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Mol1SeedEditor } from "./Mol1SeedEditor";
import { validSeedEntries } from "./mol1-seeds";
import { parseSeedText } from "../presentation/prediction-draft-model";

afterEach(cleanup);
function Editor({ initial = "", initialPrimary = 101 }) {
  const [text, onText] = useState(initial);
  const [primary, onPrimary] = useState(initialPrimary);
  return (
    <>
      <Mol1SeedEditor
        text={text}
        onText={onText}
        primary={primary}
        onPrimary={onPrimary}
        language="en"
      />
      <output aria-label="Raw draft seeds">
        {JSON.stringify({ primary, text })}
      </output>
      <button type="button" disabled={!validSeedEntries(primary, text)}>
        Continue
      </button>
    </>
  );
}

it("keeps a deliberately empty row visible, invalid and saveable as raw draft text", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await user.click(screen.getByRole("button", { name: "Add seed" }));
  const seed = screen.getByLabelText("Seed 2");
  expect(seed).toHaveFocus();
  await user.clear(seed);
  expect(seed).toHaveValue("");
  expect(seed).toHaveFocus();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(
    JSON.parse(screen.getByLabelText("Raw draft seeds").textContent!),
  ).toEqual({ primary: 101, text: " " });
  expect(parseSeedText(" ")).toEqual([NaN]);
  await user.click(screen.getByRole("button", { name: "Remove seed 2" }));
  expect(screen.queryByLabelText("Seed 2")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Primary seed")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
});

it("opens legacy incomplete drafts without normalizing other seed tokens", async () => {
  const user = userEvent.setup();
  render(<Editor initial="101,,unfinished," />);
  expect(screen.getByLabelText("Seed 3")).toHaveValue("");
  expect(screen.getByLabelText("Seed 4")).toHaveValue("unfinished");
  expect(screen.getByLabelText("Seed 5")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  await user.type(screen.getByLabelText("Seed 5"), "303");
  expect(
    JSON.parse(screen.getByLabelText("Raw draft seeds").textContent!).text,
  ).toBe("101,,unfinished,303");
  expect(screen.getByRole("button", { name: "Remove seed 1" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Remove seed 1" }));
  expect(
    JSON.parse(screen.getByLabelText("Raw draft seeds").textContent!),
  ).toEqual({ primary: 101, text: ",unfinished,303" });
  expect(screen.getByRole("button", { name: "Remove seed 1" })).toBeDisabled();
});

it("suggests an unused bounded seed at the integer boundary and promotes a removed primary", async () => {
  const user = userEvent.setup();
  render(<Editor initialPrimary={2147483647} initial="0" />);
  await user.click(screen.getByRole("button", { name: "Add seed" }));
  expect(screen.getByLabelText("Seed 3")).toHaveValue("1");
  await user.click(screen.getByRole("button", { name: "Remove seed 1" }));
  expect(screen.getByLabelText("Primary seed")).toHaveValue(0);
  expect(screen.getByLabelText("Primary seed")).toHaveFocus();
  expect(screen.getByLabelText("Seed 2")).toHaveValue("1");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
});
