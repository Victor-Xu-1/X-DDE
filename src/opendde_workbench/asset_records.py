"""Download an exact existing molecular record without creating a new scientific asset."""

import hashlib
from itertools import islice
from pathlib import Path
from urllib.parse import quote

from fastapi.responses import Response

from .chemistry.sdf_io import iter_records


def molecular_record_response(assets, asset, record):
    if asset.kind != "ligand" or asset.suffix not in {".sdf", ".mol"}:
        raise ValueError("Record download requires an SDF or MOL molecular file.")
    file = assets.path(asset)
    if file.stat().st_size > 25 * 1024**2:
        raise ValueError("Molecular record download is limited to 25 MiB.")
    raw = file.read_bytes()
    if len(raw) != asset.size or hashlib.sha256(raw).hexdigest() != asset.sha256:
        raise ValueError("The original molecular file changed; download was rejected.")
    if asset.suffix == ".sdf":
        records = iter_records(raw)
        selected = next(islice(records, record, record + 1), None)
        if not selected or not selected.strip():
            raise ValueError("The selected original molecular record is missing or empty.")
        if not selected.endswith((b"\n", b"\r")):
            selected += b"\n"
        content = raw if record == 0 and next(records, None) is None else selected + b"$$$$\n"
        filename = f"{Path(asset.name).stem}-record-{record + 1}.sdf"
    else:
        if record != 0:
            raise ValueError("MOL files contain exactly one molecular record.")
        content, filename = raw, asset.name
    return Response(
        content,
        media_type="chemical/x-mdl-sdfile" if asset.suffix == ".sdf" else "chemical/x-mdl-molfile",
        headers={
            "Content-Disposition": "attachment; filename*=utf-8''" + quote(filename, safe=""),
            "X-Structure-Format": asset.suffix.removeprefix("."),
            "X-Structure-Record": str(record),
        },
    )
