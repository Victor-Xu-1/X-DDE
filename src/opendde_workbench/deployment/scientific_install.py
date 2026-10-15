"""Install reviewed programs/resources under the existing durable deployment authority."""

import hashlib
import os
import shutil
import stat
import tarfile
import zipfile
from contextlib import ExitStack
from pathlib import Path, PurePosixPath
from uuid import uuid4

from ..disk_space import available_bytes
from ..integrations.image import lock_digest, prepare_context
from ..integrations.specs import PROGRAMS, recipe_digest
from ..locations import atomic_json, read_json
from .locked_packages import conda_archives
from .paths import environment_root
from .scientific_cache import cached_image
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
    destination = environment_root(root, identifier) / (spec["version"] + "-" + str(uuid4()))
    image = cached_image(identifier, execute, report)
    if image:
        checkpoint()
        destination.mkdir(parents=True, exist_ok=False)
        report("Reusing the reviewed native environment from the local image cache")
        return verified_runtime(identifier, destination, image, execute, report)
    if available_bytes(root) < 16 * 1024**3:
        raise ValueError("The isolated scientific environment needs at least 16 GiB staging space.")
    source = None
    if "source" in spec:
        entry = spec["source"]
        archive = root / "downloads" / (identifier + "-" + spec["version"] + ".zip")
        download(entry["url"], archive, entry["sha256"], report, checkpoint)
        temporary = work / "source"
        extract(archive, temporary, checkpoint, skipped_links=entry.get("skipped_links"))
        source = temporary / entry["prefix"]
        if not source.is_dir() or source.is_symlink():
            raise ValueError("Native source archive layout differs from the reviewed release.")
    context = destination / "image-context"
    extra_sources = {}
    for entry in spec.get("source_dependencies", []):
        archive = (
            root
            / "downloads"
            / (identifier + "-" + entry["id"] + "-" + entry["sha256"][:16] + ".zip")
        )
        download(entry["url"], archive, entry["sha256"], report, checkpoint)
        temporary = work / ("dependency-" + entry["id"])
        extract(archive, temporary, checkpoint, skipped_links=entry.get("skipped_links"))
        folder = temporary / entry["prefix"]
        if not folder.is_dir() or folder.is_symlink():
            raise ValueError("Native dependency source differs from the fixed archive layout.")
        extra_sources[entry["id"]] = folder
    archives = None
    if identifier == "openfe":
        from pathlib import Path

        import opendde_workbench.integrations.image as image_recipe

        archives = conda_archives(
            Path(image_recipe.__file__).with_name("recipes") / "openfe.conda.txt",
            root / "downloads" / "dependency-archives",
            report,
            checkpoint,
        )
    prepare_context(identifier, context, source, extra_sources=extra_sources, archives=archives)
    checkpoint()
    report("Building the reviewed independent scientific environment")
    tag = "xdde-" + identifier + ":" + recipe_digest(identifier)[:16]
    network = ["--network=none"] if identifier == "openfe" else []
    execute(["docker", "build", *network, "--tag", tag, context], timeout=7200)
    image = execute(["docker", "image", "inspect", "--format", "{{.Id}}", tag]).strip()
    return verified_runtime(identifier, destination, image, execute, report)


def verified_runtime(identifier, destination, image, execute, report):
    """A cache hit and a source build share the same native readiness and receipt boundary."""
    if not image.startswith("sha256:") or len(image) != 71:
        raise ValueError("Native image build returned no immutable image identity.")
    from .native_readiness import verify_native_entrypoint

    report("Checking the installed native command entrypoint")
    verify_native_entrypoint(identifier, image, execute)
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


def _directory_identity(path):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode):
        raise ValueError("Model staging must use real owned directories, not links.")
    return info.st_dev, info.st_ino


def _discard_model_attempt(root, destination, identities):
    """Reclaim this invocation's directory only, never accepted models or caches."""
    for path, identity in identities:
        if _directory_identity(path) != identity:
            raise ValueError("Model staging ownership changed; retaining files for review.")
    # atomic_json may have replaced installed.json before a subsequent error. The
    # persisted authority, rather than the exception alone, determines acceptance.
    installed = read_json(root / "installed.json")
    if any(
        entry.get("models") and Path(entry["models"]).resolve() == destination
        for entry in installed.values()
    ):
        return
    # Open and verify the attempt itself, not just its parent. The pathname may
    # change after validation; recursive deletion must remain on this exact inode.
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    parent_fd = os.open(destination.parent, flags)
    try:
        info = os.fstat(parent_fd)
        if (info.st_dev, info.st_ino) != identities[-2][1]:
            raise ValueError("Model staging parent changed; retaining files for review.")
        attempt_fd = os.open(destination.name, flags, dir_fd=parent_fd)
        try:
            info = os.fstat(attempt_fd)
            if (info.st_dev, info.st_ino) != identities[-1][1]:
                raise ValueError("Model staging ownership changed; retaining files for review.")
            with os.scandir(attempt_fd) as entries:
                for entry in entries:
                    if entry.is_dir(follow_symlinks=False):
                        shutil.rmtree(entry.name, dir_fd=attempt_fd)
                    else:
                        os.unlink(entry.name, dir_fd=attempt_fd)
            info = os.stat(destination.name, dir_fd=parent_fd, follow_symlinks=False)
            if (info.st_dev, info.st_ino) != identities[-1][1]:
                raise ValueError("Model staging ownership changed; retaining files for review.")
            # Only remove the now-empty directory here, never recursively delete
            # through the pathname again. rmdir cannot remove replacement contents.
            os.rmdir(destination.name, dir_fd=parent_fd)
        finally:
            os.close(attempt_fd)
    finally:
        os.close(parent_fd)


def install_models(identifier, root, report, checkpoint, *, pending=None):
    """Keep attempt ownership until the caller publishes its installed metadata."""
    with ExitStack() as attempt:
        result = _install_models(identifier, root, report, checkpoint, attempt)
        if pending is not None:
            pending.callback(attempt.pop_all().close)
        else:
            # Direct callers accept the returned models; deployment callers hand
            # cleanup to their publication scope instead.
            attempt.pop_all()
        return result


def _install_models(identifier, root, report, checkpoint, attempt):
    root = root.absolute()
    spec = PROGRAMS[identifier]
    resources = spec["models"]
    if not resources:
        raise ValueError("This scientific program has no separate pretrained model package.")
    required = (
        sum(
            sum(
                member["size"] + member.get("transport", {}).get("size", row["size"])
                for member in row["selected_members"]
            )
            if row.get("selected_members")
            else row["size"] * 3
            for row in resources
        )
        + 4 * 1024**3
    )
    if available_bytes(root) < required:
        raise ValueError("Insufficient free space for verified model downloads and extraction.")
    destination = (
        root / "models" / identifier / (recipe_digest(identifier)[:16] + "-" + str(uuid4()))
    )
    directories = [root, root / "models", destination.parent]
    if root.absolute() != root.resolve() or Path(identifier).name != identifier:
        raise ValueError("Model staging must stay inside the owned model root.")
    for directory in directories:
        if directory.is_symlink():
            raise ValueError("Model staging must use real owned directories, not links.")
        directory.mkdir(exist_ok=True)
    destination.mkdir()
    identities = [(path, _directory_identity(path)) for path in [*directories, destination]]
    attempt.callback(_discard_model_attempt, root, destination, identities)
    for row in resources:
        name = row["name"]
        archive = root / "downloads" / (identifier + "-" + row["sha256"][:16] + "-" + name)
        report("Preparing verified model resource: " + name)
        selected = row.get("selected_members", [])
        if selected and all(
            member.get("transport", {}).get("kind") == "verified_zip_range" for member in selected
        ):
            from .model_ranges import download_member

            for member in selected:
                cache = root / "downloads" / (identifier + "-" + member["sha256"][:16] + ".deflate")
                download_member(row, member, destination, cache, report, checkpoint)
            continue
        download(row["url"], archive, row["sha256"], report, checkpoint, limit=row["size"])
        if row.get("selected_members"):
            from .model_members import extract_selected

            extract_selected(archive, destination, row["selected_members"], checkpoint)
            continue
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
