"""Fixed-core local stereo checks in the exact mapped three-dimensional frame."""


def chemical_stereo(molecule):
    """Bookkeeping map labels must not manufacture stereochemical differences."""
    from rdkit import Chem

    if molecule is None:
        raise ValueError("Core verification requires a parsed molecule.")
    mol = Chem.Mol(molecule)
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(0)
    mol.UpdatePropertyCache(strict=False)
    Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    return mol


def volume(points):
    import numpy as np

    return float(
        np.linalg.det(
            np.array([tuple(a - b for a, b in zip(p, points[-1], strict=True)) for p in points[:3]])
        )
    )


def stereo_status(source, candidate, mapping, positions, output_positions):
    """Check closed tetrahedral/double-bond stereo and actual local 3D orientation.

    A selected stereocentre with unselected defining neighbours cannot be proven
    from the fixed region. It is explicitly indeterminate, never called preserved.
    """
    import numpy as np
    from rdkit import Chem

    for index, target in mapping.items():
        atom = source.GetAtomWithIdx(index)
        tag = atom.GetChiralTag()
        if tag == Chem.ChiralType.CHI_UNSPECIFIED:
            continue
        if tag not in {Chem.ChiralType.CHI_TETRAHEDRAL_CW, Chem.ChiralType.CHI_TETRAHEDRAL_CCW}:
            return "indeterminate", "unsupported_stereochemistry"
        neighbours = [a.GetIdx() for a in atom.GetNeighbors()]
        other = candidate.GetAtomWithIdx(target)
        if not set(neighbours) <= mapping.keys() or len(neighbours) not in {3, 4}:
            return "indeterminate", "stereo_crosses_fixed_boundary"
        mapped = [mapping[i] for i in neighbours]
        actual = [a.GetIdx() for a in other.GetNeighbors()]
        if set(mapped) != set(actual) or atom.GetTotalNumHs() != other.GetTotalNumHs():
            return "failed", "stereo_neighbourhood_changed"
        if other.GetChiralTag() not in {
            Chem.ChiralType.CHI_TETRAHEDRAL_CW,
            Chem.ChiralType.CHI_TETRAHEDRAL_CCW,
        }:
            return "failed", "stereochemistry_missing"
        order = [actual.index(i) for i in mapped]
        odd = (
            sum(order[i] > order[j] for i in range(len(order)) for j in range(i + 1, len(order)))
            % 2
        )
        if (tag != other.GetChiralTag()) != bool(odd):
            return "failed", "stereochemistry_changed"
        a = [positions[i] for i in neighbours]
        b = [output_positions[i] for i in mapped]
        if len(neighbours) == 3:
            a.append(positions[index])
            b.append(output_positions[target])
        first, second = volume(a), volume(b)
        if abs(first) < 1e-6 or abs(second) < 1e-6:
            return "indeterminate", "degenerate_stereo_geometry"
        if first * second < 0:
            return "failed", "stereo_geometry_inverted"
    for bond in source.GetBonds():
        left, right = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if (
            left not in mapping
            or right not in mapping
            or bond.GetStereo() == Chem.BondStereo.STEREONONE
        ):
            continue
        if bond.GetStereo() not in {
            Chem.BondStereo.STEREOE,
            Chem.BondStereo.STEREOZ,
            Chem.BondStereo.STEREOCIS,
            Chem.BondStereo.STEREOTRANS,
        }:
            return "indeterminate", "unsupported_stereochemistry"
        defining = list(bond.GetStereoAtoms())
        if len(defining) != 2 or not set(defining) <= mapping.keys():
            return "indeterminate", "stereo_crosses_fixed_boundary"
        other = candidate.GetBondBetweenAtoms(mapping[left], mapping[right])
        # RDKit stereo labels depend on its chosen defining atoms; use geometry in
        # the exact source defining-atom frame, rather than compare absolute labels.
        if other.GetStereo() not in {
            Chem.BondStereo.STEREOE,
            Chem.BondStereo.STEREOZ,
            Chem.BondStereo.STEREOCIS,
            Chem.BondStereo.STEREOTRANS,
        }:
            return "failed", "stereochemistry_missing"

        def side(points, ids):
            p, q, r, s = [np.array(points[i]) for i in ids]
            axis = r - q
            length = float(np.dot(axis, axis))
            if length < 1e-12:
                return 0.0
            u, v = p - q, s - r
            return float(
                np.dot(u - axis * np.dot(u, axis) / length, v - axis * np.dot(v, axis) / length)
            )

        ids = [defining[0], left, right, defining[1]]
        first, second = side(positions, ids), side(output_positions, [mapping[i] for i in ids])
        if abs(first) < 1e-6 or abs(second) < 1e-6:
            return "indeterminate", "degenerate_stereo_geometry"
        if first * second < 0:
            return "failed", "stereo_geometry_inverted"
        same_side = {Chem.BondStereo.STEREOZ, Chem.BondStereo.STEREOCIS}
        if (first > 0) != (bond.GetStereo() in same_side):
            return "indeterminate", "source_stereo_geometry_inconsistent"
        other_defining = list(other.GetStereoAtoms())
        if len(other_defining) != 2:
            return "failed", "stereochemistry_missing"
        actual_ids = [
            other_defining[0],
            other.GetBeginAtomIdx(),
            other.GetEndAtomIdx(),
            other_defining[1],
        ]
        actual_side = side(output_positions, actual_ids)
        if abs(actual_side) < 1e-6:
            return "indeterminate", "degenerate_stereo_geometry"
        if (actual_side > 0) != (other.GetStereo() in same_side):
            return "failed", "stereochemistry_changed"
    return "passed", None
