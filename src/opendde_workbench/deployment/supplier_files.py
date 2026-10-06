"""Supplier files use the existing deployment queue and resumable research AssetStore."""

import hashlib
import os
import zipfile
from pathlib import Path
from uuid import NAMESPACE_URL, uuid4, uuid5

from ..asset_uploads import UploadInput, UploadStore
from ..assets import AssetStore
from ..datasets.public_resources import RESOURCES, VERSION, manifest_digest
from ..datasets.source_text import normalize_text
from ..locations import atomic_json
from ..settings import Settings
from ..store import Store
from .transfers import download


def extract_structure(archive, resource, destination, checkpoint):
    with zipfile.ZipFile(archive) as bundle:
        members = bundle.infolist()
        if len(members) > 10000 or sum(row.file_size for row in members) > 20 * 1024**3:
            raise ValueError("Supplier archive exceeds its expansion budget.")
        for row in members:
            name = row.filename.replace("\\", "/")
            if (
                name.startswith("/")
                or ".." in Path(name).parts
                or ":" in name
                or row.flag_bits & 1
                or row.external_attr >> 16 & 0o170000 == 0o120000
            ):
                raise ValueError("Supplier archive contains an unsafe or encrypted member.")
        member = bundle.getinfo(resource["member"])
        if member.file_size != resource.get("source_size", resource["size"]):
            raise ValueError("Supplier structure size differs from the reviewed source.")
        digest = hashlib.sha256()
        with bundle.open(member) as source, destination.open("wb") as output:
            while chunk := source.read(4 * 1024**2):
                checkpoint()
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != resource.get("source_sha256", resource["sha256"]):
            raise ValueError("Supplier structure differs from its reviewed content identity.")


def prepare_structure(source, resource, directory, checkpoint):
    if not resource.get("text_profile"):
        return source
    target = directory / resource["filename"]
    result = normalize_text(
        source, target, resource["text_profile"], resource["id_column"], checkpoint
    )
    if (result["sha256"], result["size"]) != (resource["sha256"], resource["size"]):
        raise ValueError("Normalized supplier text differs from its reviewed derived identity.")
    return target


def release_previous_upload(uploads, source, resource, checkpoint):
    if not resource.get("text_profile"):
        return
    identifier = uuid5(NAMESPACE_URL, "x-dde/supplier-file/" + resource["source_sha256"])
    try:
        row = uploads.get(identifier)
    except FileNotFoundError:
        return
    if row["state"] != "uploading":
        return  # Registered original assets and unrelated histories are always retained.
    if (row["name"], row["kind"], row["size"]) != (
        resource["source_filename"],
        "library",
        resource["source_size"],
    ):
        raise ValueError("The previous upload is not this supplier's original source.")
    with uploads.path(row).open("rb") as retained, source.open("rb") as original:
        while chunk := retained.read(4 * 1024**2):
            checkpoint()
            if original.read(len(chunk)) != chunk:
                raise ValueError("Preserve a previous upload with different supplier bytes.")
    # Only an exact, installer-owned temporary upload is cancelled. Its raw source
    # remains in the checksum-verified ZIP; the UTF-8 asset has already been published.
    uploads.cancel(identifier)


def register_file(uploads, file, resource, checkpoint):
    identifier = uuid5(NAMESPACE_URL, "x-dde/supplier-file/" + resource["sha256"])
    try:
        retained = uploads.assets.get(identifier)
    except FileNotFoundError:
        retained = None
    if retained:
        if (retained.kind, retained.sha256, retained.size) != (
            "library",
            resource["sha256"],
            resource["size"],
        ):
            raise ValueError("The supplier file reference identifies different research bytes.")
        with uploads.assets.path(retained).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != resource["sha256"]:
                raise ValueError("The retained supplier structure file changed.")
        return retained
    row = uploads.create(
        UploadInput(name=resource["filename"], kind="library", size=resource["size"]), identifier
    )
    with file.open("rb") as stream:
        stream.seek(row["offset"])
        while chunk := stream.read(4 * 1024**2):
            checkpoint()
            row = uploads.append(
                identifier, row["offset"], chunk, hashlib.sha256(chunk).hexdigest()
            )
    checkpoint()
    asset = uploads.finalize(identifier)
    if asset.sha256 != resource["sha256"]:
        raise ValueError("Registered supplier input differs from its downloaded source.")
    return asset


def install(root, state, report, checkpoint):
    if state is None:
        raise ValueError("Supplier files require the current X-DDE research state.")
    assets = AssetStore(Store(state / "jobs.sqlite3"), state / "assets")
    uploads = UploadStore(
        assets,
        int(os.environ.get("WB_DATASET_FILE_BYTES", Settings.dataset_file_bytes)),
        int(os.environ.get("WB_DATASET_QUOTA_BYTES", Settings.dataset_quota_bytes)),
        Settings.minimum_free_bytes,
    )
    directory = root / "packages/supplier-libraries" / (VERSION + "-" + str(uuid4()))
    directory.mkdir(parents=True)
    files = {}
    try:
        for key, resource in RESOURCES.items():
            checkpoint()
            report("Preparing supplier file " + str(len(files) + 1) + "/" + str(len(RESOURCES)))
            archive = root / "downloads" / (key + ".zip")
            download(resource["url"], archive, resource["archive_sha256"], report, checkpoint)
            structure = directory / resource.get("source_filename", resource["filename"])
            try:
                extract_structure(archive, resource, structure, checkpoint)
                normalized = prepare_structure(structure, resource, directory, checkpoint)
                asset = register_file(uploads, normalized, resource, checkpoint)
                files[key] = asset.model_dump()
                release_previous_upload(uploads, structure, resource, checkpoint)
            finally:
                # Only this operation's extracted copy is removed. The shared AssetStore
                # retains registered files and incomplete, verified uploads for resume.
                structure.unlink(missing_ok=True)
                (directory / resource["filename"]).unlink(missing_ok=True)
        value = {"directory": str(directory), "files": files, "manifest_sha256": manifest_digest()}
        atomic_json(directory / "sources.json", value)
        return value
    finally:
        if not (directory / "sources.json").exists():
            directory.rmdir()
