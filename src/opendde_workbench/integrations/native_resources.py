"""Shared fail-closed model-manifest checks for installation readiness and native execution."""

import hashlib
import json
from pathlib import PurePosixPath

PROTEIN_COMPONENTS = (
    "ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL".split()
)

# Existing schema-1 manifests and encoded libraries retain these reviewed identities.
# Each value hashes every recipe field EXCEPT system_packages. A weight, source,
# patch, Python dependency, base-image or other recipe change cannot use this bridge.
_REVIEWED_MODEL_PROFILES = {
    "ab0363175f4cc81e2d9e73c3bd6aa0c8eaa941ad5c69e03874db29d7dde6648e":
        "fec1f9c8fbcb689cc8a8b24948d0bcfffbae7cb0f1158caa5bb2facf540ab98e",
    "5c795106ff2a9f697f8288c09a8d0e0f2fd9f955405e1726c7d1652f336ed3f5":
        "26333a7e4294d5c8161a60b6f839b90c54a52fa3f699f0ff7ea50a045dc585cb",
}


def _recipe_hash(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def model_recipe_identity(spec):
    """Retain a known model identity through system-library-only recipe repairs."""
    profile = _recipe_hash({key: value for key, value in spec.items() if key != "system_packages"})
    for legacy, expected in _REVIEWED_MODEL_PROFILES.items():
        if profile == expected:
            return legacy
    return _recipe_hash(spec)


def protein_molecule_directory(root):
    """The reviewed BoltzGen mols.zip contains flat CCD files, not a mols/ folder."""
    for component in PROTEIN_COMPONENTS:
        file = root / (component + ".pkl")
        if file.is_symlink() or not file.is_file() or file.stat().st_size == 0:
            raise ValueError(
                "The native protein molecule library is missing a canonical component."
            )
    return root


def model_files(root, spec, *, full_hash=False):
    file = root / "manifest.json"
    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Invalid native model manifest.")
    manifest = json.loads(file.read_text(encoding="utf-8"))
    if (
        manifest.get("recipe_sha256") not in {_recipe_hash(spec), model_recipe_identity(spec)}
        or not manifest.get("files")
    ):
        raise ValueError("Native model resources differ from the reviewed recipe.")
    entries = manifest["files"]
    if not isinstance(entries, list) or len(entries) > 200000:
        raise ValueError("Invalid native model member count.")
    by_name = {row["name"]: row for row in entries}
    if len(by_name) != len(entries):
        raise ValueError("Duplicate native model resource identities.")
    for expected in spec["models"]:
        for resource in expected.get("selected_members", [expected]):
            saved = by_name.get(resource["name"])
            if not saved or (saved["sha256"], saved["size"]) != (
                resource["sha256"],
                resource["size"],
            ):
                raise ValueError("A required official model resource is missing or changed.")
    for row in entries:
        name = PurePosixPath(row["name"])
        if name.is_absolute() or ".." in name.parts or "\\" in row["name"]:
            raise ValueError("Unsafe native resource path.")
        path = root.joinpath(*name.parts)
        if (
            path.is_symlink()
            or not path.resolve().is_relative_to(root.resolve())
            or not path.is_file()
            or path.stat().st_size != row["size"]
        ):
            raise ValueError("A selected model resource is missing or changed.")
        if full_hash:
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest != row["sha256"]:
                raise ValueError("Native model resource integrity check failed.")
    if spec.get("name") == "BoltzGen":
        protein_molecule_directory(root)
    return manifest
