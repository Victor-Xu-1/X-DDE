"""Resolve immutable input snapshots for the shared native descriptor algorithm."""

from pathlib import Path

from property_calculation import properties


def run_properties(request, bindings, directory, output):
    resolved = {}
    root = (directory / "assets").resolve()
    for identifier in request["ligand_files"]:
        binding = bindings[identifier]
        if not isinstance(binding, str) or not binding.startswith("/job/assets/"):
            raise ValueError("Molecular input binding escapes its managed snapshot.")
        file = directory / binding.removeprefix("/job/")
        if (
            file.is_symlink() or not file.resolve().is_relative_to(root)
            or file.suffix.lower() not in {".sdf", ".mol", ".mol2", ".pdb"}
            or file.stat().st_size > 25 * 1024**2
        ):
            raise ValueError("Choose a bounded molecular file from the task snapshot.")
        resolved[identifier] = str(Path(file))
    return properties(request, resolved, output)
