"""Strict heavy-atom PDB identities shared by native execution and host validation."""

import math
from collections.abc import Iterator
from typing import NamedTuple

BACKBONE = frozenset({"N", "CA", "C", "O", "OXT"})


def pdb_records(raw: bytes, kinds: tuple[str, ...]) -> Iterator[tuple[int, str]]:
    """Read UTF-8 annotations without changing byte-based structural line identities."""
    for index, encoded in enumerate(raw.splitlines()):
        try:
            kind = encoded[:6].decode("ascii")
        except UnicodeDecodeError as exc:
            raise ValueError("PDB record names must be ASCII.") from exc
        if kind not in kinds:
            try:
                encoded.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise ValueError("PDB metadata must use valid UTF-8.") from exc
            continue
        try:
            yield index, encoded.decode("ascii")
        except UnicodeDecodeError as exc:
            raise ValueError("PDB structural records must be ASCII.") from exc


class Atom(NamedTuple):
    line: int
    serial: int
    record: str
    chain: str
    number: int
    insertion: str
    name: str
    residue: str
    element: str
    position: tuple[float, float, float]

    @property
    def token(self) -> str:
        return f"{self.chain}:{self.number}" + (":" + self.insertion if self.insertion else "")


def parse_atoms(raw: bytes, *, reject_hydrogens: bool = False) -> dict[tuple, Atom]:
    if not raw or len(raw) > 25 * 1024**2:
        raise ValueError("Receptor PDB is empty or exceeds its bounded file size.")
    result = {}
    serials = set()
    models = 0
    for index, line in pdb_records(raw, ("MODEL ", "ATOM  ", "HETATM")):
        if line.startswith("MODEL "):
            models += 1
            if models > 1:
                raise ValueError("Sidechain refinement requires one receptor model.")
        if line[:6] not in ("ATOM  ", "HETATM"):
            continue
        if len(line) < 78 or line[16].strip():
            raise ValueError("Prepare explicit atom elements and one alternate before refinement.")
        element = line[76:78].strip().upper()
        if not element or len(element) > 2 or not element.isalpha():
            raise ValueError("Receptor atoms require explicit unambiguous element symbols.")
        if element in {"H", "D", "T"}:
            if reject_hydrogens:
                raise ValueError("Prepare a heavy-atom receptor before sidechain refinement.")
            continue  # Engine-added hydrogens remain in the preserved raw native file.
        xyz = tuple(float(line[i : i + 8]) for i in (30, 38, 46))
        if not all(math.isfinite(value) for value in xyz):
            raise ValueError("Receptor coordinates must be finite.")
        atom = Atom(
            index,
            int(line[6:11]),
            line[:6].strip(),
            line[21],
            int(line[22:26]),
            line[26].strip(),
            line[12:16].strip(),
            line[17:20].strip(),
            element,
            xyz,
        )
        key = (atom.chain, atom.number, atom.insertion, atom.name)
        if not atom.name or not atom.residue or key in result or atom.serial in serials:
            raise ValueError("Receptor atom identities must be present and unique.")
        result[key] = atom
        serials.add(atom.serial)
        if len(result) > 250000:
            raise ValueError("Receptor atom count exceeds the bounded refinement profile.")
    if not result:
        raise ValueError("Receptor has no identifiable heavy atoms.")
    return result
