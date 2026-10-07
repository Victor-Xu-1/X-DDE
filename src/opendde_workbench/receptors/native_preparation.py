"""Offline fixed Biopython parser: select observed model/chains/atoms and export a new file."""

from native_io import input_file, write_model
from native_selection import read_selected, select_atoms
from preparation_options import PreparationOptions


def run_preparation(request, bindings, directory, output):
    from Bio import __version__ as version

    options = PreparationOptions.model_validate(request["options"])
    source = request["structure"]
    file = input_file(source, bindings, directory)
    model, inspection = read_selected(file, options)
    atoms, removed, resolved = select_atoms(model, options)
    artifact = "prepared." + options.format
    digest = write_model(model, output / artifact)
    return {
        "operation": "structure_prepare",
        "complete": True,
        "schema_version": 1,
        "source": source,
        "options": options.model_dump(mode="json"),
        "artifact": artifact,
        "sha256": digest,
        "inspection": inspection,
        "atom_count": len(atoms),
        "removed_residues": removed,
        "resolved_alternates": resolved,
        "versions": {"biopython": version},
        "coordinate_frame": "source_coordinates_selected_model",
        "coordinate_unit": "angstrom",
        "scope": "observed_selection_and_format_export_not_chemical_preparation",
        "unobserved_atoms": "not_generated",
        "biological_assembly": "provided_coordinates_only",
    }
