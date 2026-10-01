"""Keep raw SDF record identities even when the native parser yields no molecule."""

from io import BytesIO


def read_records(raw):
    from rdkit import Chem

    if not raw or len(raw) > 25 * 1024**2:
        raise ValueError("Choose a nonempty SDF file no larger than 25 MiB.")
    blocks, current = [], []
    for line in raw.splitlines(keepends=True):
        if line.strip() == b"$$$$":
            blocks.append(b"".join(current))
            current = []
            if len(blocks) > 500:
                raise ValueError("Split this SDF into one to 500 input records.")
        else:
            current.append(line)
    tail = b"".join(current)
    if tail.strip():
        blocks.append(tail)
    if not 1 <= len(blocks) <= 500:
        raise ValueError("Split this SDF into one to 500 input records.")
    molecules = []
    for block in blocks:
        # A single detail record can end at EOF. Framing affects parser input only;
        # source bytes/digest remain untouched and full SD properties are retained.
        records = list(
            Chem.ForwardSDMolSupplier(
                BytesIO(block + b"\n$$$$\n"), removeHs=False, strictParsing=True
            )
        )
        molecules.append(records[0] if len(records) == 1 else None)
    return molecules
