"""Install reviewed programs/resources under the existing durable deployment authority."""

import hashlib
import shutil
import tarfile
import zipfile
from pathlib import PurePosixPath
from uuid import uuid4

from ..integrations.image import lock_digest, prepare_context
from ..integrations.specs import PROGRAMS, recipe_digest
from ..locations import atomic_json
from .paths import environment_root
from .transfers import download, extract


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def install_runtime(identifier, root, work, execute, report, checkpoint):
    spec = PROGRAMS[identifier]
    if not shutil.which("docker"):
        raise RuntimeError(
            "Prepare the server Docker prerequisites before installing this environment."
        )
    if shutil.disk_usage(root).free < 16 * 1024**3:
        raise ValueError("The isolated scientific environment needs at least 16 GiB staging space.")
    destination = environment_root(root, identifier) / (spec["version"] + "-" + str(uuid4()))
    source = None
    if "source" in spec:
        entry = spec["source"]
        archive = root / "downloads" / (identifier + "-" + spec["version"] + ".zip")
        download(entry["url"], archive, entry["sha256"], report, checkpoint)
        temporary = work / "source"
        extract(archive, temporary, checkpoint)
        source = temporary / entry["prefix"]
        if not source.is_dir() or source.is_symlink():
            raise ValueError("Native source archive layout differs from the reviewed release.")
    context = destination / "image-context"
    prepare_context(identifier, context, source)
    checkpoint()
    report("Building the reviewed independent scientific environment")
    tag = "xdde-" + identifier + ":" + recipe_digest(identifier)[:16]
    execute(["docker", "build", "--tag", tag, context], timeout=7200)
    image = execute(["docker", "image", "inspect", "--format", "{{.Id}}", tag]).strip()
    if not image.startswith("sha256:") or len(image) != 71:
        raise ValueError("Native image build returned no immutable image identity.")
    return {
        "directory": str(destination),
        "image": image,
        "recipe_sha256": recipe_digest(identifier),
        "runtime_lock_sha256": lock_digest(identifier),
    }


def model_archive(archive, destination, checkpoint):
    names, total = set(), 0

    def target(name, size):
        nonlocal total
        checkpoint()
        path = PurePosixPath(name)
        total += size
        if (
            path.is_absolute()
            or ".." in path.parts
            or "\\" in name
            or name in names
            or total > 12 * 1024**3
            or len(names) >= 200000
        ):
            raise ValueError("Native model archive contains unsafe or excessive members.")
        names.add(name)
        result = destination.joinpath(*path.parts)
        result.parent.mkdir(parents=True, exist_ok=True)
        return result

    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as source:
            for row in source.infolist():
                if row.is_dir():
                    continue
                if (row.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError("Native model archive links are not accepted.")
                with (
                    source.open(row) as stream,
                    target(row.filename, row.file_size).open("wb") as output,
                ):
                    shutil.copyfileobj(stream, output)
    else:
        with tarfile.open(archive, "r:") as source:
            for row in source:
                if row.isdir():
                    continue
                if not row.isfile():
                    raise ValueError("Native model archive special/link members are not accepted.")
                with (
                    source.extractfile(row) as stream,
                    target(row.name, row.size).open("wb") as output,
                ):
                    shutil.copyfileobj(stream, output)


def install_models(identifier, root, report, checkpoint):
    spec = PROGRAMS[identifier]
    resources = spec["models"]
    if not resources:
        raise ValueError("This scientific program has no separate pretrained model package.")
    if shutil.disk_usage(root).free < sum(row["size"] for row in resources) * 3 + 4 * 1024**3:
        raise ValueError("Insufficient free space for verified model downloads and extraction.")
    destination = (
        root / "models" / identifier / (recipe_digest(identifier)[:16] + "-" + str(uuid4()))
    )
    destination.mkdir(parents=True)
    for row in resources:
        name = row["name"]
        archive = root / "downloads" / (identifier + "-" + row["sha256"][:16] + "-" + name)
        report("Preparing verified model resource: " + name)
        download(row["url"], archive, row["sha256"], report, checkpoint, limit=row["size"])
        target = destination / name
        shutil.copyfile(archive, target)
        if name.endswith((".zip", ".tar")):
            model_archive(target, destination, checkpoint)
    files = []
    for file in sorted(destination.rglob("*")):
        if file.is_file():
            checkpoint()
            files.append(
                {
                    "name": str(file.relative_to(destination)).replace("\\", "/"),
                    "size": file.stat().st_size,
                    "sha256": digest(file),
                }
            )
            file.chmod(0o444)
    manifest = destination / "manifest.json"
    atomic_json(
        manifest,
        {
            "schema_version": 1,
            "program": identifier,
            "recipe_sha256": recipe_digest(identifier),
            "files": files,
        },
    )
    return {
        "models": str(destination),
        "manifest_sha256": digest(manifest),
        "recipe_sha256": recipe_digest(identifier),
    }
