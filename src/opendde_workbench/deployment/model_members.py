"""Extract only checksum-reviewed model members from an already verified official archive."""

import hashlib
import shutil
import zipfile
from pathlib import PurePosixPath


def extract_selected(archive, destination, members, checkpoint):
    if not 1 <= len(members) <= 32 or len({row["name"] for row in members}) != len(members):
        raise ValueError("The selected native model member list is invalid.")
    with zipfile.ZipFile(archive) as source:
        entries = {row.filename: row for row in source.infolist()}
        if len(entries) != len(source.infolist()):
            raise ValueError("Native model archive contains duplicate member identities.")
        for expected in members:
            name = PurePosixPath(expected["name"])
            member = PurePosixPath(expected["member"])
            row = entries.get(expected["member"])
            if (
                name.name != expected["name"]
                or member.is_absolute()
                or ".." in member.parts
                or "\\" in expected["member"]
                or row is None
                or row.file_size != expected["size"]
                or (row.external_attr >> 16) & 0o170000 == 0o120000
            ):
                raise ValueError("The exact official model member is missing, unsafe or changed.")
            target = destination / expected["name"]
            temporary = target.with_suffix(target.suffix + ".part")
            with source.open(row) as reader, temporary.open("wb") as writer:
                while chunk := reader.read(1024**2):
                    checkpoint()
                    writer.write(chunk)
            with temporary.open("rb") as file:
                actual = hashlib.file_digest(file, "sha256").hexdigest()
            if actual != expected["sha256"]:
                raise ValueError("Selected official model bytes failed their fixed checksum.")
            shutil.move(temporary, target)
