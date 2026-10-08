export interface ContactResidue {
  chain: string;
  residue_id: number;
  residue_name: string;
  contacts: number;
}
export const contactLabel = (row: ContactResidue) =>
  `${row.chain}:${row.residue_name}${row.residue_id}`;
/** Validate native records without merging identities or changing reported counts. */
export function contactRecords(value: unknown): ContactResidue[] {
  if (!Array.isArray(value) || value.length > 5000)
    throw new Error("Invalid contact records");
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object")
      throw new Error("Invalid contact residue");
    const record = row as ContactResidue;
    if (
      typeof record.chain !== "string" ||
      record.chain.length > 16 ||
      typeof record.residue_name !== "string" ||
      !record.residue_name.trim() ||
      record.residue_name.length > 16 ||
      !Number.isSafeInteger(record.residue_id) ||
      !Number.isSafeInteger(record.contacts) ||
      record.contacts < 0
    )
      throw new Error("Invalid contact residue");
    return record;
  });
}
export function proteinContacts(rows: readonly ContactResidue[]) {
  return rows
    .filter((row) => !["HOH", "WAT", "H2O", "DOD"].includes(row.residue_name))
    .sort((a, b) => b.contacts - a.contacts);
}
