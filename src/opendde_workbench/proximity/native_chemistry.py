"""Exact complete chemical identities and bounded fixed-arm conformers; native only."""

from copy import deepcopy

import numpy as np
from native_io import input_file
from rdkit import Chem
from rdkit.Chem import rdDistGeom
from rdkit.DistanceGeometry.DistGeom import DoTriangleSmoothing

ELEMENTS = {6, 7, 8, 9, 15, 16, 17, 35, 53}


class ConformerUnavailable(ValueError):
    """One finite embedding proposal did not produce a conformer."""


def read_molecule(request, role):
    file, reference = input_file(request, role)
    if file.suffix == ".mol":
        if reference["record"]:
            raise ValueError("A MOL file has one molecular record.")
        molecule = Chem.MolFromMolFile(str(file), removeHs=False)
    elif file.suffix == ".sdf":
        records = Chem.SDMolSupplier(str(file), removeHs=False)
        if reference["record"] >= len(records):
            raise ValueError("The selected molecular record is missing.")
        molecule = records[reference["record"]]
    else:
        raise ValueError("Ternary ligand chemistry requires a complete SDF/MOL graph.")
    if molecule is None or len(Chem.GetMolFrags(molecule)) != 1:
        raise ValueError("Choose a single connected, chemically valid molecule.")
    original_indices = [a.GetIdx() for a in molecule.GetAtoms() if a.GetAtomicNum() != 1]
    molecule = Chem.RemoveHs(molecule)
    if not 3 <= molecule.GetNumAtoms() <= 256:
        raise ValueError("The reviewed ternary model supports 3–256 heavy atoms per molecule.")
    if any(a.GetAtomicNum() not in ELEMENTS for a in molecule.GetAtoms()):
        raise ValueError("This ternary model does not support the supplied element or dummy atom.")
    if molecule.GetNumConformers() != 1 or not molecule.GetConformer().Is3D():
        raise ValueError("Choose one explicitly three-dimensional molecular pose.")
    coordinates = molecule.GetConformer().GetPositions()
    if not np.isfinite(coordinates).all() or np.abs(coordinates).max() > 100000:
        raise ValueError("Molecular pose coordinates are invalid.")
    Chem.AssignStereochemistry(molecule, cleanIt=True, force=True)
    return molecule, original_indices


def arm_mapping(full, arm, original_indices, declared):
    matches = full.GetSubstructMatches(arm, useChirality=True, uniquify=False, maxMatches=257)
    if len(matches) > 256:
        raise ValueError("Arm mapping exceeds its finite symmetry budget.")
    if declared:
        inverse = {value: index for index, value in enumerate(original_indices)}
        if len(declared) != arm.GetNumAtoms() or any(index not in inverse for index in declared):
            raise ValueError("The explicit arm map does not cover the original heavy atoms.")
        mapping = tuple(inverse[index] for index in declared)
        if mapping not in matches:
            raise ValueError("The arm map changes elements, bonds or defined stereochemistry.")
        return mapping
    if len(matches) != 1:
        raise ValueError(
            "The binding arm lacks a unique exact chemical mapping. "
            "Choose an explicit atom mapping; distance matching is not accepted."
        )
    return matches[0]


def fragment_from_indices(full, original_indices, selected):
    inverse = {value: index for index, value in enumerate(original_indices)}
    if (
        len(selected) < 3
        or len(set(selected)) != len(selected)
        or not set(selected) <= inverse.keys()
    ):
        raise ValueError(
            "Select at least three distinct original heavy atoms for each binding region."
        )
    mapped = deepcopy(full)
    for atom in mapped.GetAtoms():
        atom.SetAtomMapNum(atom.GetIdx() + 1)
    smiles = Chem.MolFragmentToSmiles(
        mapped, atomsToUse=[inverse[i] for i in selected], isomericSmiles=True, canonical=False
    )
    arm = Chem.MolFromSmiles(smiles)
    if arm is None or len(Chem.GetMolFrags(arm)) != 1:
        raise ValueError("A selected binding region must be one connected chemical fragment.")
    mapping = tuple(atom.GetAtomMapNum() - 1 for atom in arm.GetAtoms())
    conformer = Chem.Conformer(arm.GetNumAtoms())
    conformer.Set3D(True)
    for atom, index in zip(arm.GetAtoms(), mapping, strict=True):
        atom.SetAtomMapNum(0)
        conformer.SetAtomPosition(atom.GetIdx(), full.GetConformer().GetAtomPosition(index))
    arm.AddConformer(conformer)
    Chem.AssignStereochemistry(arm, cleanIt=True, force=True)
    if mapping not in full.GetSubstructMatches(
        arm, useChirality=True, uniquify=False, maxMatches=257
    ):
        raise ValueError(
            "Fragment capping changed the confirmed chemical or stereochemical correspondence."
        )
    return arm, mapping


def read_chemistry(request):
    full, indices = read_molecule(request, "ligand")
    if request["payload"]["mechanism"] == "molecular_glue":
        return full, indices, ()
    arms = []
    for role in ("a", "b"):
        declared = request["payload"]["arm_" + role + "_map"]
        if request["payload"]["input_mode"] == "shared_complex":
            arm, mapping = fragment_from_indices(
                full, indices, request["payload"]["binding_region_" + role]
            )
        else:
            arm, _ = read_molecule(request, "arm_" + role)
            mapping = arm_mapping(full, arm, indices, declared)
        arms.append((arm, mapping))
    if set(arms[0][1]) & set(arms[1][1]):
        raise ValueError("Binding-arm identities overlap in the complete molecule.")
    retained = set(arms[0][1]) | set(arms[1][1])
    if len(retained) == full.GetNumAtoms():
        raise ValueError(
            "The bridging molecule has no explicit connecting region outside its binding arms."
        )
    return full, indices, tuple(arms)


def fixed_arm_conformer(full, arms, seed):
    """Internal arm distances are preserved; no unknown pose is invented or downloaded."""
    hydrogenated = Chem.AddHs(deepcopy(full), addCoords=True)
    parameters = rdDistGeom.ETKDGv3()
    parameters.randomSeed = seed
    parameters.maxIterations = 500
    if arms:
        bounds = rdDistGeom.GetMoleculeBoundsMatrix(hydrogenated)
        for arm, mapping in arms:
            coordinates = arm.GetConformer().GetPositions()
            for local, first in enumerate(mapping):
                for other in range(local + 1, len(mapping)):
                    second = mapping[other]
                    low, high = sorted((first, second))
                    distance = float(np.linalg.norm(coordinates[local] - coordinates[other]))
                    if distance <= 0:
                        raise ValueError("The binding-arm pose contains coincident atoms.")
                    bounds[low, high] = distance + 0.1
                    bounds[high, low] = max(0.0, distance - 0.1)
        if not DoTriangleSmoothing(bounds):
            raise ValueError("The declared binding-arm geometry is chemically incompatible.")
        parameters.SetBoundsMat(bounds)
    if rdDistGeom.EmbedMolecule(hydrogenated, parameters) < 0:
        raise ConformerUnavailable("No conformer was generated within the finite embedding budget.")
    generated = Chem.RemoveHs(hydrogenated)
    if Chem.MolToSmiles(generated, isomericSmiles=True) != Chem.MolToSmiles(
        full, isomericSmiles=True
    ):
        raise ValueError("Conformer generation changed the complete chemical graph.")
    return generated
