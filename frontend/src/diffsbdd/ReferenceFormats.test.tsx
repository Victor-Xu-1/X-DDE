import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { ReferencePicker } from "./ReferencePicker";
import { catalogFixture } from "./input-catalog.test-fixtures";
import type { MoleculeRef } from "../research/types";
afterEach(() => vi.restoreAllMocks());
it.each([".mol", ".sdf"])(
  "shows a record control only for actual SDF inputs: %s",
  async (suffix) => {
    const asset = {
      id: "STAT6",
      name: "STAT6" + suffix,
      kind: "ligand" as const,
      suffix,
      size: 100,
      sha256: "a".repeat(64),
      created_at: "",
    };
    vi.spyOn(client, "request").mockImplementation(
      async (path) =>
        (path.startsWith("/research/input-catalog")
          ? catalogFixture([], [asset])
          : asset) as never,
    );
    function Task() {
      const [value, setValue] = useState<MoleculeRef | null>(null);
      return (
        <ReferencePicker
          value={value}
          onChange={setValue}
          kind="ligand"
          allowedSuffixes={[".mol", ".sdf"]}
          language="en"
          label="Ligand"
        />
      );
    }
    render(<Task />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Historical files" }));
    const picker = screen.getByRole("combobox", {
      name: "Ligand · Historical files",
    });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.selectOptions(picker, "file:STAT6");
    if (suffix === ".mol") expect(screen.queryByRole("spinbutton")).toBeNull();
    else {
      expect(await screen.findByRole("spinbutton")).toHaveValue(1);
      await user.click(
        screen.getByRole("radio", { name: "Upload a new file" }),
      );
      await user.click(screen.getByRole("radio", { name: "Historical files" }));
      expect(await screen.findByRole("spinbutton")).toHaveValue(1);
      await user.clear(screen.getByRole("spinbutton"));
      expect(picker).toHaveValue("file:STAT6");
      await user.type(screen.getByRole("spinbutton"), "2");
      expect(screen.getByRole("spinbutton")).toHaveValue(2);
    }
  },
);
