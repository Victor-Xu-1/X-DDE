"""Bounded calculated-stage inventory/copy; no models, pickle loading or user paths."""

import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path, PurePosixPath

MAX_FILES = 4000
MAX_BYTES = 512 * 1024**2
MAX_FILE_BYTES = 32 * 1024**2
STAGES = {"intermediate_designs", "intermediate_designs_inverse_folded"}
SUBSTAGES = {"fold_out_npz", "fold_out_design_npz", "refold_cif", "refold_design_cif"}


def allowed(name):
    path = PurePosixPath(name)
    return (
        "\\" not in name
        and len(path.parts) in {2, 3}
        and path.parts[0] in STAGES
        and (
            len(path.parts) == 2
            or (
                path.parts[0] == "intermediate_designs_inverse_folded"
                and path.parts[1] in SUBSTAGES
            )
        )
        and re.fullmatch(r"design_[0-9]+\.(cif|npz)", path.name) is not None
    )


def inventory(root, count):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Calculated binder stage outputs are unavailable.")
    files, total, expanded, visited = {}, 0, 0, 0
    for stage in sorted(STAGES):
        folder = root / stage
        if not folder.exists():
            continue
        if folder.is_symlink() or not folder.is_dir():
            raise ValueError("Binder checkpoint directories must be real managed directories.")
        for file in folder.rglob("*"):
            visited += 1
            if visited > 2 * MAX_FILES:
                raise ValueError("The binder checkpoint directory exceeds its entry budget.")
            if file.is_symlink():
                raise ValueError("Binder checkpoints cannot contain symbolic links.")
            if file.is_dir():
                continue
            name = file.relative_to(root).as_posix()
            if not allowed(name):
                continue  # Logs, caches and generated configurations are never resumed.
            if not file.is_file() or not 0 < file.stat().st_size <= MAX_FILE_BYTES:
                raise ValueError("A binder checkpoint file exceeds its size boundary.")
            total += file.stat().st_size
            if len(files) >= MAX_FILES or total > MAX_BYTES:
                raise ValueError("The binder checkpoint exceeds its file/byte budget.")
            index = int(re.search(r"design_(\d+)", file.name).group(1))
            if not 0 <= index < count:
                raise ValueError("A checkpoint design is outside its original candidate budget.")
            if file.suffix == ".npz":
                # Check archive integrity without loading pickled arrays or allocating them.
                try:
                    with zipfile.ZipFile(file) as archive:
                        entries = archive.infolist()
                        size = sum(item.file_size for item in entries)
                        expanded += size
                        if len(entries) > 256 or size > MAX_FILE_BYTES or expanded > MAX_BYTES:
                            raise ValueError("A binder checkpoint array archive is oversized.")
                        if archive.testzip() is not None:
                            raise ValueError("A binder checkpoint array archive is incomplete.")
                except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
                    raise ValueError("A binder checkpoint array archive is invalid.") from exc
            files[name] = {
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                "size": file.stat().st_size,
            }
    generated = [
        n
        for n in files
        if n.startswith("intermediate_designs/")
        and len(PurePosixPath(n).parts) == 2
        and n.endswith(".cif")
    ]
    if not generated:
        raise ValueError("No calculated binder conformers are available to continue.")
    # The installed generation loader skips through its highest existing index;
    # unlike the later loaders it does NOT fill holes in a generated prefix.
    generated_indices = sorted(int(re.search(r"design_(\d+)", n).group(1)) for n in generated)
    if generated_indices != list(range(len(generated_indices))):
        raise ValueError("Calculated binder generation must be a contiguous prefix from zero.")
    for stage in STAGES:
        for suffix in (".cif", ".npz"):
            names = [n for n in files if n.startswith(stage + "/") and n.endswith(suffix)]
            direct = [n for n in names if len(PurePosixPath(n).parts) == 2]
            indices = [int(re.search(r"design_(\d+)", n).group(1)) for n in direct]
            if len(indices) != len(set(indices)):
                raise ValueError("Checkpoint design indices contain ambiguous aliases.")
    for name in files:
        parts = PurePosixPath(name).parts
        if len(parts) == 3 and parts[1] == "fold_out_npz" and name.endswith(".npz"):
            paired = f"{parts[0]}/refold_cif/{PurePosixPath(name).stem}.cif"
            # The native writer saves NPZ before CIF, but --reuse checks only NPZ.
            # Reject this interrupted write instead of silently skipping its structure.
            if paired not in files:
                raise ValueError("A calculated complex refold has no matching CIF structure.")
        if name.endswith(".cif") and name[:-4] + ".npz" not in files:
            # Native refold CIFs have their arrays in a sibling stage directory.
            sibling = {"refold_cif": "fold_out_npz", "refold_design_cif": "fold_out_design_npz"}
            paired = (
                f"{parts[0]}/{sibling[parts[1]]}/{PurePosixPath(name).stem}.npz"
                if len(parts) == 3 and parts[1] in sibling
                else ""
            )
            if paired not in files:
                raise ValueError("A calculated binder structure has no matching native arrays.")
    return files


def restore(root, target, expected, count):
    """Copy verified native outputs to a NEW task; original stage bytes stay read-only."""
    if inventory(root, count) != expected:
        raise ValueError("The original binder checkpoint bytes changed after review.")
    target = Path(target)
    if target.exists():
        raise ValueError("A continuation requires an empty native output directory.")
    target.mkdir(parents=True)
    for name, value in expected.items():
        if not allowed(name):
            raise ValueError("A binder checkpoint path is outside calculated native stages.")
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(Path(root) / name, destination)
        if hashlib.sha256(destination.read_bytes()).hexdigest() != value["sha256"]:
            raise ValueError("Copied binder checkpoint differs from its original file.")


def restore_bound_checkpoint(request, target):
    manifest = json.loads(Path("/input/binder-checkpoint.json").read_text())
    selected = request["payload"]["continuation"]
    body = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    if (
        hashlib.sha256(body).hexdigest() != selected["sha256"]
        or manifest["job_id"] != selected["job_id"]
    ):
        raise ValueError("The continuation differs from its reviewed source checkpoint.")
    restore("/input/binder-checkpoint", target, manifest["files"], request["payload"]["candidates"])
    Path("/output/binder-continuation-source.json").write_bytes(body)
