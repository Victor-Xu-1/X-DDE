"""Reviewed mixed-encoding metadata becomes UTF-8 without changing molecular records."""

import hashlib
import re

SURROGATES = re.compile(r"[\udc80-\udcff]")
PROPERTY = re.compile(rb"^>\s*(?:\d+\s*)?<([^>\r\n]+)>")


def normalize_text(source, target, profile, id_column, checkpoint):
    """No guessing/fallback: a hash-reviewed resource supplies its explicit text policy."""
    codec = profile.get("legacy_codepage")
    property_codecs = profile.get("legacy_properties", {})
    escaped = set(profile.get("escaped_bytes", []))
    if (
        codec not in {None, "cp1251", "cp1252"}
        or any(value not in {"cp1251", "cp1252"} for value in property_codecs.values())
        or any(not isinstance(value, int) or not 128 <= value <= 255 for value in escaped)
    ):
        raise ValueError("Unsupported reviewed supplier text profile.")
    if source.resolve() == target.resolve():
        raise ValueError("Normalize into a new file; preserve the original supplier bytes.")
    digest = hashlib.sha256()
    size = replaced = escaped_count = record_line = 0
    properties = False
    property_name = None
    since_checkpoint = 0

    def convert(match):
        nonlocal replaced, escaped_count
        value = ord(match[0]) - 0xDC00
        selected_codec = property_codecs.get(property_name, codec)
        if value in escaped or (selected_codec is None and profile.get("escape_unreviewed_bytes")):
            escaped_count += 1
            return f"\\x{value:02X}"
        if selected_codec is None:
            raise ValueError("Unreviewed legacy byte in a supplier property.")
        replaced += 1
        return bytes([value]).decode(selected_codec, errors="strict")

    with source.open("rb") as stream, target.open("wb") as output:
        while raw := stream.readline(1024**2 + 1):
            if len(raw) > 1024**2 or b"\x00" in raw:
                raise ValueError("Supplier metadata has an excessive line or NUL byte.")
            since_checkpoint += len(raw)
            if since_checkpoint >= 4 * 1024**2:
                checkpoint()
                since_checkpoint = 0
            if raw.strip() == b"$$$$":
                properties, property_name, record_line = False, None, 0
            else:
                if raw.startswith(b"M  END"):
                    properties = True
                match = PROPERTY.match(raw)
                if match:
                    property_name = match[1].decode("utf-8", errors="strict")
                text = raw.decode("utf-8", errors="surrogateescape")
                if SURROGATES.search(text):
                    if (record_line >= 3 and not properties) or property_name == id_column:
                        raise ValueError(
                            "Legacy encoding cannot alter atom/bond data or supplier IDs."
                        )
                    raw = SURROGATES.sub(convert, text).encode("utf-8")
                record_line += 1
            digest.update(raw)
            size += len(raw)
            output.write(raw)
    return {
        "sha256": digest.hexdigest(),
        "size": size,
        "legacy_characters": replaced,
        "escaped_characters": escaped_count,
    }
