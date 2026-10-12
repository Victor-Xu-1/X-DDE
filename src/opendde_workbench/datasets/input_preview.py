"""A bounded table header/row preview supports ordinary users choosing real input columns."""

import codecs
import csv
import gzip
import io
import re
import zlib
from contextlib import ExitStack, contextmanager
from uuid import UUID

from fastapi import HTTPException

_TEXT_BYTES = 512 * 1024
# Leave room for gzip framing, including stored (uncompressed) deflate blocks.
_COMPRESSED_BYTES = _TEXT_BYTES + 64 * 1024


class _ByteBudget(io.RawIOBase):
    """Limit bytes before text decoding, and separately before decompression."""

    def __init__(self, source, limit, description):
        super().__init__()
        self.source = source
        self.remaining = limit
        self.description = description

    def readable(self):
        return True

    def readinto(self, buffer):
        if not buffer:
            return 0
        # One byte of lookahead distinguishes an exact-limit EOF from exhaustion.
        size = min(len(buffer), self.remaining) if self.remaining else 1
        read = getattr(self.source, "read1", self.source.read)
        data = read(size)
        if len(data) > self.remaining:
            raise ValueError(f"The preview exceeds the supported {self.description} budget.")
        buffer[: len(data)] = data
        self.remaining -= len(data)
        return len(data)


@contextmanager
def _preview_bytes(file, compressed):
    with ExitStack() as stack:
        source = stack.enter_context(open(file, "rb"))
        if compressed:
            # Buffer the capped raw reader: gzip reads comments/filenames a byte
            # at a time, and empty concatenated members consume no decoded bytes.
            raw = stack.enter_context(
                io.BufferedReader(_ByteBudget(source, _COMPRESSED_BYTES, "compressed input"))
            )
            source = stack.enter_context(gzip.GzipFile(fileobj=raw, mode="rb"))
        yield stack.enter_context(io.BufferedReader(_ByteBudget(source, _TEXT_BYTES, "text")))


def register(app, assets):
    @app.get("/api/datasets/files/{asset_id}/preview")
    def preview(asset_id: UUID):
        try:
            asset = assets.get(asset_id)
            if asset.kind not in {"library", "counts"}:
                raise ValueError("Choose a molecular library or count table.")
            file = assets.path(asset)
            if asset.suffix in {".sdf", ".sdf.gz"}:
                with _preview_bytes(file, asset.suffix.endswith(".gz")) as stream:
                    data = stream.read(_TEXT_BYTES)
                # Large SDF libraries retain their bounded-prefix preview. A
                # multibyte character cut by the byte boundary is not malformed
                # input, and an incomplete property name is not exposed.
                block = codecs.getincrementaldecoder("utf-8-sig")().decode(
                    data, final=len(data) < _TEXT_BYTES
                )
                properties = list(
                    dict.fromkeys(re.findall(r"(?m)^>\s*(?:\d+\s*)?<([^>\r\n]+)>", block))
                )
                if len(properties) > 128 or any(len(name) > 80 for name in properties):
                    raise ValueError("The source has too many or overly long SDF properties.")
                return {
                    "columns": [],
                    "rows": [],
                    "format": asset.suffix,
                    "table": False,
                    "sdf_properties": properties,
                }
            if asset.suffix not in {".csv", ".tsv", ".csv.gz", ".tsv.gz"}:
                return {"columns": [], "rows": [], "format": asset.suffix, "table": False}
            with (
                _preview_bytes(file, asset.suffix.endswith(".gz")) as binary,
                io.TextIOWrapper(binary, encoding="utf-8-sig", newline="") as stream,
            ):

                def lines():
                    while True:
                        line = stream.readline(65536)
                        if not line:
                            return
                        if not line.endswith(("\n", "\r")) and len(line) >= 65536:
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
        except (ValueError, OSError, EOFError, zlib.error, csv.Error) as exc:
            raise HTTPException(422, str(exc)) from exc
