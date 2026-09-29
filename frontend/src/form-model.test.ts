import { describe, expect, it, vi, afterEach } from "vitest";
import { defaults, prediction, validate } from "./form-model";
import { persistLanguage, restoreLanguage, translator, messages } from "./i18n";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("molecular input boundaries", () => {
  it("requires meaningful name and components", () => {
    expect(validate(" ", [])).toBe("requiredName");
    expect(validate("test", [])).toBe("requiredInput");
    expect(
      validate("test", [{ kind: "protein", value: "ABC?", count: 1 }]),
    ).toBe("invalidProtein");
    expect(
      validate("test", [{ kind: "ligand", value: "FILE_/tmp/x", count: 1 }]),
    ).toBe("invalidLigand");
  });
  it("normalizes only protein whitespace and preserves chemical stereochemistry", () => {
    const input = prediction(
      " Task ",
      [
        { kind: "protein", value: " acd\nEF ", count: 2 },
        { kind: "ligand", value: " C/C=C\\C ", count: 1 },
      ],
      defaults,
    );
    expect(input.components[0]).toEqual({
      kind: "protein",
      value: "ACDEF",
      count: 2,
    });
    expect(input.components[1].value).toBe("C/C=C\\C");
    expect(defaults.samples).toBe(1);
  });
});
describe("language state", () => {
  it("provides both locales and persists the selection", () => {
    for (const pair of Object.values(messages))
      expect(pair.every((value) => value.length > 0)).toBe(true);
    expect(restoreLanguage()).toBe("zh");
    expect(persistLanguage("en")).toBe(true);
    expect(restoreLanguage()).toBe("en");
    expect(translator("zh")("succeeded")).toBe("已完成");
    expect(translator("en")("succeeded")).toBe("Completed");
  });
  it("reports blocked persistence and rejects invalid stored language", () => {
    localStorage.setItem("opendde-workbench.language", "invalid");
    expect(restoreLanguage()).toBe("zh");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(persistLanguage("en")).toBe(false);
  });
});

import { normalizeProtein } from "./form-model";
it("accepts a single FASTA record and rejects multiple concatenated records", () => {
  expect(
    normalizeProtein(">human target\\nacd e\\nFG".replaceAll("\\n", "\n")),
  ).toBe("ACDEFG");
  expect(
    validate("example", [
      { kind: "protein", value: ">one\nACD\n>two\nEFG", count: 1 },
    ]),
  ).toBe("invalidProtein");
});
