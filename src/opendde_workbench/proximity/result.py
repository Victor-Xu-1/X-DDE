"""Cross-check native three-component geometry, input references and reusable outputs."""

import math

from ..artifacts import contained
from .graph_identity import graph_signature


def pdb_atoms(file):
    rows = []
    for line in file.read_text().splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            try:
                row = {
                    "serial": int(line[6:11]),
                    "chain": line[21],
                    "number": int(line[22:26]),
                    "insertion": line[26].strip(),
                    "residue": line[17:20].strip(),
                    "atom": line[12:16].strip(),
                    "element": line[76:78].strip().capitalize(),
                    "position": tuple(float(line[i : i + 8]) for i in (30, 38, 46)),
                }
            except (ValueError, IndexError) as error:
                raise ValueError(
                    "Native assembly has invalid PDB coordinates or identities."
                ) from error
            if not all(math.isfinite(n) for n in row["position"]):
                raise ValueError("Native assembly coordinates must be finite.")
            rows.append(row)
    if not rows or len({row["serial"] for row in rows}) != len(rows):
        raise ValueError("Native assembly atoms need unique serial identities.")
    return rows


def same_position(actual, expected):
    return (
        len(actual) == len(expected) == 3
        and max(abs(a - b) for a, b in zip(actual, expected, strict=True)) <= 0.0011
    )


def validate_ternary(result, request, output):
    value = result.proximity
    if value is None:
        raise ValueError("The ternary model did not return typed assembly evidence.")
    from ..integrations.specs import PROGRAMS

    if result.version != PROGRAMS["deepternary"]["version"] or value.versions != {
        "torch": "2.3.1+cpu",
        "rdkit": "2023.09.3",
        "biopython": "1.84",
    }:
        raise ValueError("Native ternary software differs from the reviewed CPU protocol.")
    sources = {item.role: item.source for item in request.inputs}
    payload = request.payload
    if value.mechanism != payload.mechanism or value.source_ligand != sources["ligand"]:
        raise ValueError("Ternary mechanism or complete molecule differs from the confirmed task.")
    if [row.source for row in value.partner_mapping] != [
        sources["partner_a"],
        sources["partner_b"],
    ]:
        raise ValueError("Ternary protein partners differ from their selected immutable versions.")
    if (
        value.search.requested != payload.samples
        or value.search.attempt_budget != payload.attempt_budget
    ):
        raise ValueError("Native proposal budget differs from the selected research plan.")
    for partner, chain in zip(
        value.partner_mapping, (payload.partner_a_chain, payload.partner_b_chain), strict=True
    ):
        if any(atom.chain != chain for atom in partner.atoms):
            raise ValueError("The selected original partner chain changed during modeling.")
    atoms = value.ligand_atom_indices
    for index, mapping in enumerate(value.arm_maps):
        declared = (payload.arm_a_map, payload.arm_b_map)[index]
        if payload.input_mode == "shared_complex":
            region = (payload.binding_region_a, payload.binding_region_b)[index]
            if set(mapping) != set(region):
                raise ValueError("The derived binding region changed its confirmed source atoms.")

        if (
            (declared and declared != mapping)
            or len(set(mapping)) != len(mapping)
            or not set(mapping) <= set(atoms)
        ):
            raise ValueError("The binding-arm mapping changed its full-molecule atom identities.")
    if len(value.arm_maps) == 2 and set(value.arm_maps[0]) & set(value.arm_maps[1]):
        raise ValueError("The complete-molecule binding arms overlap.")
    reusable = {}
    for row in value.assemblies:
        expected_names = [
            row.id + ".pdb",
            row.id + "-ligand.sdf",
            row.id + "-partner-a.pdb",
            row.id + "-partner-b.pdb",
        ]
        names = [row.complex_artifact, row.ligand_artifact, *row.partner_artifacts]
        if names != expected_names or not set(names) <= result.artifact_sha256.keys():
            raise ValueError("Native assembly component files do not match their exact proposal.")
        complex_rows = pdb_atoms(contained(output, row.complex_artifact))
        if set(atom["chain"] for atom in complex_rows) != {"A", "B", "L"}:
            raise ValueError(
                "The complete native complex must contain both partners and its ligand."
            )
        for index, partner in enumerate(value.partner_mapping):
            actual = [atom for atom in complex_rows if atom["chain"] == partner.output_chain]
            separate = pdb_atoms(contained(output, row.partner_artifacts[index]))
            if len(actual) != len(partner.atoms) or len(separate) != len(actual):
                raise ValueError("A ternary proposal dropped or added a selected partner atom.")
            for atom, other, source in zip(actual, separate, partner.atoms, strict=True):
                if any(
                    atom[key] != getattr(source, key)
                    for key in ("number", "insertion", "residue", "atom", "element")
                ) or any(
                    atom[key] != other[key]
                    for key in (
                        "chain",
                        "number",
                        "insertion",
                        "residue",
                        "atom",
                        "element",
                        "position",
                    )
                ):
                    raise ValueError("The native partner atom correspondence is inconsistent.")
                expected = source.position
                if index:
                    transform = row.partner_b_transform
                    expected = tuple(
                        sum(transform.rotation[i][j] * source.position[j] for j in range(3))
                        + transform.translation[i]
                        for i in range(3)
                    )
                if not same_position(atom["position"], expected):
                    raise ValueError(
                        "Assembly coordinates disagree with their declared source transform."
                    )
        sdf = contained(output, row.ligand_artifact).read_text().splitlines()
        if len(sdf) < 5 or "V2000" not in sdf[3] or sum(line == "$$$$" for line in sdf) != 1:
            raise ValueError("Native ligand output needs one complete V2000 chemical record.")
        count, bonds = int(sdf[3][:3]), int(sdf[3][3:6])
        if count != len(atoms) or not 1 <= bonds <= 1024:
            raise ValueError("The ternary ligand lost its complete graph.")
        if graph_signature(sdf) != value.chemical_graph.model_dump():
            raise ValueError("The native ligand changed source elements, charges or bonds.")
        ligand = [atom for atom in complex_rows if atom["chain"] == "L"]
        if len(ligand) != count:
            raise ValueError("The complete ligand is missing from the native assembly.")
        for atom, line in zip(ligand, sdf[4 : 4 + count], strict=True):
            expected = tuple(float(line[i : i + 10]) for i in (0, 10, 20))
            if atom["element"] != line[31:34].strip() or not same_position(
                atom["position"], expected
            ):
                raise ValueError(
                    "The chemical SDF pose differs from the displayed whole-complex ligand."
                )
        if row.quality.accepted:
            reusable[row.id] = row.complex_artifact
            reusable[row.id + "-ligand"] = row.ligand_artifact
    if {row.id: row.artifact for row in result.candidates} != reusable:
        raise ValueError(
            "Only independently qualified complete assemblies and ligands are reusable."
        )
    for row in result.candidates:
        expected_smiles = value.source_smiles if row.id.endswith("-ligand") else None
        if row.smiles != expected_smiles or row.geometry != "predicted_structure":
            raise ValueError("A reusable ternary candidate lost its complete chemical identity.")
