"""Fixed public datasets use the same resumable upload and asset ownership as user research."""

import hashlib
from uuid import UUID, uuid5

from ..asset_uploads import UploadInput, UploadStore
from .files import verified_file

NAMESPACE = UUID("02c7e7e7-fb65-4867-9042-0541ed9eb342")


def register_dataset_input(assets, cache, spec, *, kind):
    data = verified_file(cache, spec)
    if kind == "config":
        return assets.save(spec.name, kind, data)
    uploads = UploadStore(assets, 50 * 1024**3, 200 * 1024**3, 0)
    identity = uuid5(NAMESPACE, spec.sha256 + ":" + kind)
    try:
        retained = assets.get(identity)
    except FileNotFoundError:
        retained = None
    if retained is not None:
        if (retained.sha256, retained.kind, retained.size) != (spec.sha256, kind, len(data)):
            raise ValueError(
                "The restored public input differs from its reviewed scientific bytes."
            )
        file = assets.path(retained)
        with file.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != spec.sha256:
                raise ValueError("The restored public input file changed.")
        return retained
    state = uploads.create(UploadInput(name=spec.name, kind=kind, size=len(data)), identity)
    if state["state"] != "complete":
        for offset in range(state["offset"], len(data), 4 * 1024**2):
            chunk = data[offset : offset + 4 * 1024**2]
            uploads.append(identity, offset, chunk, hashlib.sha256(chunk).hexdigest())
    return uploads.finalize(identity)
