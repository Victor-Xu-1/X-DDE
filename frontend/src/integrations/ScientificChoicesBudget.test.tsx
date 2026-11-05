import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ScientificChoices } from "./ScientificChoices";
import { nativeDefaults } from "./generated";
import { validScientificChoices } from "./validation";
import type { ScientificPayload, ScientificProgram } from "./types";

afterEach(cleanup);
function Plan({ program }: { program: ScientificProgram }) {
  const [payload, setPayload] = useState<ScientificPayload>({
    ...nativeDefaults[program],
    kind: program,
  });
  const [expert, setExpert] = useState(false);
  const [options, setOptions] = useState({
    cpu: 2,
    memory_mib: 8192,
    device: "cpu" as const,
    seed: 101,
  });
  return (
    <>
      <ScientificChoices
        program={program}
        language="en"
        payload={payload}
        onChange={(patch) =>
          setPayload((current) => ({ ...current, ...patch }))
        }
        options={options}
        onOptions={(value) => setOptions({ ...value, device: "cpu" })}
        expert={expert}
        onExpert={setExpert}
      />
      <button disabled={!validScientificChoices(payload)}>Continue</button>
      <output>{JSON.stringify({ payload, options })}</output>
    </>
  );
}

it.each([
  ["boltz", "Predicted structures", 2, 10, "samples"],
  ["ligandmpnn", "Generated candidates", 7, 100, "candidates"],
  ["reinvent", "Generated candidates", 237, 500, "candidates"],
] as const)(
  "allows exact native %s budgets beyond presets",
  async (program, label, count, max, key) => {
    render(<Plan program={program} />);
    const user = userEvent.setup();
    const input = screen.getByRole("spinbutton", { name: label });
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("max", String(max));
    await user.clear(input);
    await user.type(input, String(count));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(
      JSON.parse(screen.getByRole("status").textContent!).payload[key],
    ).toBe(count);
    await user.clear(input);
    await user.type(input, String(max + 1));
    expect(input).toHaveValue(max + 1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  },
);

it("owns each binder budget once and preserves values across advanced disclosure", async () => {
  render(<Plan program="boltzgen" />);
  const user = userEvent.setup();
  const generated = screen.getByRole("spinbutton", {
    name: "Generated candidates",
  });
  const retain = screen.getByRole("spinbutton", {
    name: "Retained candidates",
  });
  await user.clear(generated);
  await user.type(generated, "4");
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  await user.clear(retain);
  await user.type(retain, "2");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  const before = JSON.parse(screen.getByRole("status").textContent!);
  const toggle = screen.getByRole("button", {
    name: "Advanced settings",
  });
  await user.click(toggle);
  expect(
    screen.getAllByRole("spinbutton", {
      name: "Generated candidates",
    }),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole("spinbutton", {
      name: "Retained candidates",
    }),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("spinbutton", { name: "Random seed" }),
  ).not.toBeInTheDocument();
  await user.click(toggle);
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual(before);
});
