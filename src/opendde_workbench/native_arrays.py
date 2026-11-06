"""Bounded, non-executable NPY/NPZ reads for retained scientific previews.

Supports the fixed numeric and record dtypes written by the reviewed Boltz
writer, not arbitrary NumPy serialization. Object arrays are never loaded.
No scientific runtime or pickle dependency belongs on this display path.
"""

import ast
import io
import math
import re
import struct
import zlib
from dataclasses import dataclass
from zipfile import ZIP_DEFLATED, ZIP_STORED, BadZipFile, ZipFile

MAX_BYTES = 64 * 1024**2
MAX_HEADER = 8192


@dataclass(frozen=True)
class NativeArray:
    dtype: object
    shape: tuple[int, ...]
    fortran: bool
    body: bytes


def read_array(archive: bytes, key: str, limit=MAX_BYTES):
    """Read exactly one named array; never extract files or load object members."""
    if not 0 < len(archive) <= limit:
        raise ValueError("Native array archive exceeds its read limit.")
    # Bound the central directory before ZipFile constructs member objects.
    end = archive.rfind(b"PK\x05\x06", max(0, len(archive) - 65557))
    if end < 0 or len(archive) < end + 22:
        raise ValueError("Native array archive has no supported inventory.")
    disk, directory_disk, disk_entries, entries, directory_bytes, directory_offset, comment = (
        struct.unpack_from("<4H2IH", archive, end + 4)
    )
    if (
        disk != 0
        or directory_disk != 0
        or disk_entries != entries
        or not 0 < entries <= 32
        or end + 22 + comment != len(archive)
        or not 0 < directory_bytes <= 65536
        or directory_offset + directory_bytes != end
    ):
        raise ValueError("Native array archive has an unsupported inventory.")
    position, count = directory_offset, 0
    while position < end:
        if count >= 32 or position + 46 > end or archive[position : position + 4] != b"PK\x01\x02":
            raise ValueError("Native array central directory is invalid.")
        name_size, extra_size, comment_size = struct.unpack_from("<3H", archive, position + 28)
        member_disk = struct.unpack_from("<H", archive, position + 34)[0]
        packed_size, expanded_size = struct.unpack_from("<2I", archive, position + 20)
        local_offset = struct.unpack_from("<I", archive, position + 42)[0]
        if (
            not 0 < name_size <= 200
            or extra_size > 256
            or comment_size > 256
            or member_disk != 0
            or local_offset >= directory_offset
            or packed_size == 0xFFFFFFFF
            or expanded_size == 0xFFFFFFFF
        ):
            raise ValueError("Native array central directory uses an unsupported layout.")
        position += 46 + name_size + extra_size + comment_size
        count += 1
    if position != end or count != entries:
        raise ValueError("Native array central directory differs from its inventory.")
    try:
        with ZipFile(io.BytesIO(archive)) as source:
            entries = source.infolist()
            names = [item.filename for item in entries]
            if not 0 < len(entries) <= 32 or len(set(names)) != len(names):
                raise ValueError("Native array archive has an ambiguous inventory.")
            name = key + ".npy"
            if name not in names:
                raise ValueError("Requested native array is unavailable.")
            item = source.getinfo(name)
            if (
                item.flag_bits & 1
                or item.compress_type not in (ZIP_STORED, ZIP_DEFLATED)
                or not 0 < item.file_size <= limit
            ):
                raise ValueError("Native array exceeds its expanded read limit.")
            with source.open(item) as member:
                data = member.read(limit + 1)
            if len(data) != item.file_size or len(data) > limit:
                raise ValueError("Native array length differs from its inventory.")
    except (BadZipFile, RuntimeError, EOFError, zlib.error) as error:
        raise ValueError("Native array archive could not be read.") from error
    if data[:6] != b"\x93NUMPY" or data[6:8] not in (b"\x01\x00", b"\x02\x00"):
        raise ValueError("Unsupported native array format.")
    width = 2 if data[6] == 1 else 4
    if len(data) < 8 + width:
        raise ValueError("Native array header is truncated.")
    length = int.from_bytes(data[8 : 8 + width], "little")
    offset = 8 + width + length
    if not 0 < length <= MAX_HEADER or offset > len(data):
        raise ValueError("Native array header exceeds its read limit.")
    try:
        header = ast.literal_eval(data[8 + width : offset].decode("latin1"))
    except (ValueError, SyntaxError, RecursionError, UnicodeError) as error:
        raise ValueError("Native array header is invalid.") from error
    if not isinstance(header, dict) or set(header) != {"descr", "shape", "fortran_order"}:
        raise ValueError("Native array header fields are invalid.")
    shape = header["shape"]
    if (
        not isinstance(shape, tuple)
        or not 1 <= len(shape) <= 2
        or any(type(size) is not int or not 0 <= size <= 100000 for size in shape)
        or math.prod(shape) > limit
        or type(header["fortran_order"]) is not bool
    ):
        raise ValueError("Native array dimensions are unsupported.")
    return NativeArray(header["descr"], shape, header["fortran_order"], data[offset:])


def floats(value: NativeArray):
    """Validate every value, including elements omitted from a displayed stride."""
    if value.dtype not in ("<f4", ">f4", "<f8", ">f8"):
        raise ValueError("Native confidence requires a floating-point array.")
    size = int(value.dtype[-1])
    if len(value.body) != math.prod(value.shape) * size:
        raise ValueError("Native array data has an invalid length.")
    scalar = struct.Struct(value.dtype[0] + ("f" if size == 4 else "d"))
    if any(not math.isfinite(v) or v < 0 for (v,) in scalar.iter_unpack(value.body)):
        raise ValueError("Native confidence contains invalid numeric values.")

    def at(*indices):
        if len(indices) != len(value.shape) or any(
            type(index) is not int or not 0 <= index < size
            for index, size in zip(indices, value.shape, strict=True)
        ):
            raise ValueError("Native array index is out of range.")
        index = indices[0]
        if len(indices) == 2:
            row, column = indices
            index = (
                column * value.shape[0] + row if value.fortran else row * value.shape[1] + column
            )
        return scalar.unpack_from(value.body, index * size)[0]

    return at


def records(value: NativeArray, fields: dict[str, str]):
    """Project known primitive fields from a fixed-width native record table."""
    if len(value.shape) != 1 or value.fortran or not isinstance(value.dtype, list):
        raise ValueError("Native identity table has an unsupported shape.")
    offset, layout = 0, {}
    for field in value.dtype:
        if not isinstance(field, tuple) or len(field) not in (2, 3):
            raise ValueError("Native identity table has an unsupported field.")
        name, dtype = field[:2]
        if not isinstance(name, str) or name in layout or not isinstance(dtype, str):
            raise ValueError("Native identity table fields are ambiguous.")
        count = 1
        if len(field) == 3:
            if field[2] != (3,):
                raise ValueError("Native identity subarray is unsupported.")
            count = 3
        unicode = re.fullmatch(r"<U([1-9][0-9]?)", dtype)
        formats = {"<i4": ("<i", 4), "|i1": ("b", 1), "|b1": ("?", 1), "<f4": ("<f", 4)}
        if unicode:
            size = int(unicode[1]) * 4
        elif dtype in formats:
            size = formats[dtype][1]
        else:
            raise ValueError("Native identity table contains an unsupported dtype.")
        layout[name] = offset, dtype
        offset += size * count
    if not offset or len(value.body) != value.shape[0] * offset:
        raise ValueError("Native identity table data has an invalid length.")
    if any(name not in layout or layout[name][1] != dtype for name, dtype in fields.items()):
        raise ValueError("Native identity table lacks its required typed fields.")
    for row in range(value.shape[0]):
        record = {}
        for name, dtype in fields.items():
            start = row * offset + layout[name][0]
            if dtype.startswith("<U"):
                end = start + int(dtype[2:]) * 4
                record[name] = value.body[start:end].decode("utf-32-le").rstrip("\x00")
            else:
                record[name] = struct.unpack_from(formats[dtype][0], value.body, start)[0]
        yield record
