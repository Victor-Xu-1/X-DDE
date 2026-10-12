import { expect, it } from "vitest";
import { prolifContacts, type ProlifContact } from "./prolif-contacts";

const contact: ProlifContact = {
  label: "native chemical contact",
  kind: "hydrogen_bond",
  residue: { chain: "A", name: "ASN", number: 140, insertion_code: "B" },
  distance: 3.25,
  occurrences: 1,
  start: [1, 2, 3],
  end: [4.25, 2, 3],
};
it("keeps exact classified points, insertion identities and source rows", () => {
  const before = JSON.stringify(contact);
  expect(prolifContacts([contact])).toEqual({
    unavailable: false,
    contacts: [
      {
        kind: "hydrogen_bond",
        chain: "A",
        residue: "ASN",
        number: 140,
        insertion_code: "B",
        ligand_position: [1, 2, 3],
        protein_position: [4.25, 2, 3],
        distance: 3.25,
      },
    ],
  });
  expect(JSON.stringify(contact)).toBe(before);
  expect(prolifContacts([])).toEqual({ unavailable: false, contacts: [] });
});
it("does not create chemical points for legacy coordinate-free records", () => {
  expect(
    prolifContacts([{ ...contact, start: undefined, end: undefined }]),
  ).toEqual({ unavailable: true });
});
it.each([
  { ...contact, start: [NaN, 2, 3] },
  { ...contact, kind: "__proto__" },
  { ...contact, residue: { ...contact.residue, insertion_code: "BAD" } },
])("rejects malformed native geometry and types", (row) => {
  expect(() => prolifContacts([row])).toThrow();
});
