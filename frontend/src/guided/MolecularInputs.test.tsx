import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Component } from "../types";
import type { SetStateAction } from "react";
import { MolecularInputs } from "./MolecularInputs";

it("keeps labels bound to their own mounted prediction form", () => {
  const first = vi.fn(),
    second = vi.fn();
  const input = {
    items: [{ kind: "protein" as const, value: "", count: 1 }],
    language: "en" as const,
    expert: false,
    workflow: "complex" as const,
  };
  render(
    <>
      <MolecularInputs
        {...input}
        onChange={(update: SetStateAction<Component[]>) =>
          first(typeof update === "function" ? update(input.items) : update)
        }
      />
      <MolecularInputs
        {...input}
        onChange={(update: SetStateAction<Component[]>) =>
          second(typeof update === "function" ? update(input.items) : update)
        }
      />
    </>,
  );
  const fields = screen.getAllByRole("textbox", {
    name: "One-letter amino-acid sequence",
  });
  expect(fields).toHaveLength(2);
  expect(fields[0].id).not.toBe(fields[1].id);
  fireEvent.change(fields[1], { target: { value: "STAT6" } });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith([
    { kind: "protein", value: "STAT6", count: 1 },
  ]);
});
