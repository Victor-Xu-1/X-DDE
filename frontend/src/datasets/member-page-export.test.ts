import { expect, it } from "vitest";
import { memberPageCsv } from "./member-page-export";

it("exports only the supplied page, exact numeric precision, stable identities and safe labels", () => {
  const rows = [
    {
      id: "cmp-exact",
      display_name: "=untrusted",
      source_record: 2,
      mw: 483.12875431,
      score: null,
    },
  ];
  const original = JSON.stringify(rows);
  const csv = memberPageCsv("exact-library-job", rows);
  expect(csv).toContain(
    '"dataset_job","id","display_name","source_record","mw","score"',
  );
  expect(csv).toContain(
    '"exact-library-job","cmp-exact","\'=untrusted","2","483.12875431",""',
  );
  expect(csv.split("\r\n")).toHaveLength(2);
  expect(JSON.stringify(rows)).toBe(original);
});
