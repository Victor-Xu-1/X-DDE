"""A bounded table header/row preview supports ordinary users choosing real input columns."""

import csv
import gzip
from uuid import UUID

from fastapi import HTTPException


def register(app, assets):
    @app.get("/api/datasets/files/{asset_id}/preview")
    def preview(asset_id: UUID):
        try:
            asset = assets.get(asset_id)
            if asset.kind not in {"library", "counts"}:
                raise ValueError("Choose a molecular library or count table.")
            file = assets.path(asset)
            if asset.suffix not in {".csv", ".tsv", ".csv.gz", ".tsv.gz"}:
                return {"columns": [], "rows": [], "format": asset.suffix, "table": False}
            opener = gzip.open if asset.suffix.endswith(".gz") else open
            with opener(file, "rt", encoding="utf-8-sig", newline="") as stream:
                remaining = 512 * 1024

                def lines():
                    nonlocal remaining
                    while remaining > 0:
                        line = stream.readline(min(remaining, 65536))
                        if not line:
                            return
                        remaining -= len(line.encode("utf-8"))
                        if not line.endswith(("\n", "\r")) and (
                            remaining <= 0 or len(line) >= 65536
                        ):
                            raise ValueError("A preview row exceeds the supported text budget.")
                        yield line

                reader = csv.DictReader(lines(), delimiter="\t" if ".tsv" in asset.suffix else ",")
                columns = reader.fieldnames or []
                if (
                    len(columns) > 128
                    or len(set(columns)) != len(columns)
                    or any(len(name) > 100 for name in columns)
                ):
                    raise ValueError("The input table has unsupported or duplicate column names.")
                rows = []
                for _ in range(5):
                    row = next(reader, None)
                    if row is None:
                        break
                    if None in row:
                        raise ValueError("The input row differs from the table header.")
                    rows.append({name: str(value or "")[:300] for name, value in row.items()})
            return {"columns": columns, "rows": rows, "format": asset.suffix, "table": True}
        except (ValueError, OSError, csv.Error) as exc:
            raise HTTPException(422, str(exc)) from exc
