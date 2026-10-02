"""Public single-molecule MOL responses need SDF record delimiters when combined."""


def sdf_collection(records: list[bytes]) -> bytes:
    result = []
    for record in records:
        text = record.decode("utf-8-sig").rstrip()
        if "M  END" not in text:
            raise ValueError("A public molecular record has no MDL end marker.")
        # Individual archive responses retain their exact bytes in the input store.
        # The derived collection adds only missing record separators.
        if text.splitlines()[-1].strip() != "$$$$":
            text += "\n$$$$"
        result.append(text.encode() + b"\n")
    return b"".join(result)
