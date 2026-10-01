"""Verify archive identity/framing; native parsers validate downstream chemistry."""

import math
import re

from .transport import SourceUnavailable


def validate_archive(raw, task):
    if not raw or len(raw) > 8 * 1024**2:
        raise SourceUnavailable("Archive material is empty or exceeds its size limit.")
    text = raw.decode("utf-8")
    if "\x00" in text:
        raise SourceUnavailable("Archive material contains invalid text.")
    if task.format == "cif":
        # RCSB entry.id is a scalar in its original deposited mmCIF, not a guessed filename.
        entry = re.search(r"(?m)^_entry\.id\s+['\"]?([A-Za-z0-9_]+)['\"]?\s*$", text)
        if (
            not text.lstrip().startswith("data_")
            or not entry
            or entry[1].upper() != task.identifier
            or "_atom_site.Cartn_x" not in text
        ):
            raise SourceUnavailable(
                "mmCIF archive entry/coordinates do not match the selected record."
            )
    elif task.format == "pdb":
        headers = [line for line in text.splitlines() if line.startswith("HEADER")]
        atoms = [line for line in text.splitlines() if line.startswith(("ATOM  ", "HETATM"))]
        if not headers or headers[0][62:66].strip().upper() != task.identifier or not atoms:
            raise SourceUnavailable(
                "PDB archive entry/coordinates do not match the selected record."
            )
        try:
            if not all(
                math.isfinite(float(line[start : start + 8]))
                for line in atoms
                for start in (30, 38, 46)
            ):
                raise ValueError("Nonfinite coordinates")
        except ValueError as exc:
            raise SourceUnavailable("PDB archive has invalid coordinate fields.") from exc
    else:
        # Official ChEMBL detail serializer returns one mol block and ID, without $$$$.
        # Preserve those bytes; enforce one CTAB, optional final terminator and exact ID.
        identifier = re.search(r">\s*<chembl_id>\s*\n\s*(CHEMBL[0-9]+)\s*\n", text)
        if (
            text.count("M  END") != 1
            or text.count("$$$$") > 1
            or ("$$$$" in text and text.split("$$$$", 1)[1].strip())
            or identifier is None
            or identifier[1] != task.identifier
        ):
            raise SourceUnavailable(
                "Archive requires one complete molecular record with its exact ChEMBL ID."
            )
