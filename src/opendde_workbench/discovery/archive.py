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
    elif text.count("$$$$") != 1 or "M  END" not in text:
        raise SourceUnavailable("Archive requires one complete SDF molecular record.")
