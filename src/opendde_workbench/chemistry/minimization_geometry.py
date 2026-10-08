"""Native graph, finite-coordinate and stereochemical invariants for an existing pose."""

import math


def identity(molecule):
    from rdkit import Chem

    return Chem.MolToSmiles(Chem.RemoveHs(Chem.Mol(molecule)), isomericSmiles=True)


def check_geometry(molecule):
    if molecule.GetNumConformers() != 1 or not molecule.GetConformer().Is3D():
        raise ValueError("Provide an existing 3D SDF/MOL pose; a 2D drawing is not a 3D pose.")
    points = molecule.GetConformer().GetPositions()
    if any(not math.isfinite(float(x)) or abs(float(x)) > 100000 for p in points for x in p):
        raise ValueError("Pose coordinates must be finite and within the supported range.")
    if all(
        sum((float(x) - float(y)) ** 2 for x, y in zip(points[0], p, strict=True)) < 1e-8
        for p in points
    ):
        raise ValueError("Coincident atom coordinates are not a usable existing pose.")


def check_stereo(source, result, *, generated=False):
    from rdkit import Chem

    before, after = Chem.Mol(source), Chem.Mol(result)
    if generated:
        Chem.AssignStereochemistry(before, cleanIt=True, force=True)
    else:
        Chem.AssignStereochemistryFrom3D(before, replaceExistingTags=True)
    Chem.AssignStereochemistryFrom3D(after, replaceExistingTags=True)
    # Check declared tetrahedral centers independently of the retained graph tags.
    for atom in source.GetAtoms():
        if atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED:
            i = atom.GetIdx()
            first, second = before.GetAtomWithIdx(i), after.GetAtomWithIdx(i)
            mismatch = (
                (
                    not first.HasProp("_CIPCode")
                    or not second.HasProp("_CIPCode")
                    or first.GetProp("_CIPCode") != second.GetProp("_CIPCode")
                )
                if generated
                else first.GetChiralTag() != second.GetChiralTag()
            )
            if mismatch:
                raise ValueError("Optimization changed the coordinate-defined stereochemistry.")
    for bond in before.GetBonds():
        if bond.GetStereo() in {Chem.BondStereo.STEREOE, Chem.BondStereo.STEREOZ} and (
            after.GetBondWithIdx(bond.GetIdx()).GetStereo() != bond.GetStereo()
        ):
            raise ValueError("Optimization changed declared double-bond stereochemistry.")
    if identity(source) != identity(result):
        raise ValueError(
            "Optimization changed molecular identity, isotope, charge or stereochemistry."
        )
