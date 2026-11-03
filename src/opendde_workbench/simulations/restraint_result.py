"""A restrained task must retain the actual native force-compilation receipt."""

import json

from ..artifacts import contained


def validate_restraint_result(result, request, output):
    conditions = getattr(request.payload, "restraints", ())
    name = "restraints.json"
    if not conditions:
        if name in result.artifact_sha256:
            raise ValueError("Unrequested geometric restraints appeared in the native result.")
        return
    if name not in result.artifact_sha256:
        raise ValueError("The native calculation did not retain its requested restraint forces.")
    source = contained(output, name)
    if source.stat().st_size > 512 * 1024:
        raise ValueError("The native restraint receipt exceeds its bounded protocol size.")
    value = json.loads(source.read_text())
    if (
        value.get("method") != "OpenMM harmonic positional/distance restraints"
        or value.get("scope") != "soft_restraints_not_rigid_constraints_or_binding_energy"
        or value.get("force_constant_unit") != "kJ mol^-1 nm^-2"
        or value.get("display_distance_unit") != "angstrom"
        or value.get("position_reference") != "exact_original_input_coordinates"
        or not isinstance(value.get("conditions"), list)
        or len(value["conditions"]) != len(conditions)
    ):
        raise ValueError("The native restraint method or force units differ from the task.")
    positions = set()
    for row, condition in zip(value["conditions"], conditions, strict=True):
        if row.get("condition") != condition.model_dump(mode="json"):
            raise ValueError("Native restraints differ from the exact submitted atom conditions.")
        indices = row.get("system_atom_indices")
        if (
            not isinstance(indices, list)
            or len(indices) != (1 if condition.kind == "position" else 2)
            or any(type(index) is not int or not 0 <= index < 150000 for index in indices)
            or len(set(indices)) != len(indices)
        ):
            raise ValueError("Native restraint target atom identities are incomplete or ambiguous.")
        if condition.kind == "position":
            if indices[0] in positions:
                raise ValueError("A prepared atom received duplicate positional restraints.")
            positions.add(indices[0])
