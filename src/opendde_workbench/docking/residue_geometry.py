"""Standard-residue bond and local handedness checks; no coordinate modification."""

import math

# Original PDB atom names define identity; symmetric names are never swapped by a fit.
SIDECHAIN_BONDS = {
    "ARG": "CA-CB CB-CG CG-CD CD-NE NE-CZ CZ-NH1 CZ-NH2",
    "ASN": "CA-CB CB-CG CG-OD1 CG-ND2",
    "ASP": "CA-CB CB-CG CG-OD1 CG-OD2",
    "CYS": "CA-CB CB-SG",
    "GLN": "CA-CB CB-CG CG-CD CD-OE1 CD-NE2",
    "GLU": "CA-CB CB-CG CG-CD CD-OE1 CD-OE2",
    "HIS": "CA-CB CB-CG CG-ND1 CG-CD2 ND1-CE1 CD2-NE2 CE1-NE2",
    "ILE": "CA-CB CB-CG1 CB-CG2 CG1-CD1",
    "LEU": "CA-CB CB-CG CG-CD1 CG-CD2",
    "LYS": "CA-CB CB-CG CG-CD CD-CE CE-NZ",
    "MET": "CA-CB CB-CG CG-SD SD-CE",
    "PHE": "CA-CB CB-CG CG-CD1 CG-CD2 CD1-CE1 CD2-CE2 CE1-CZ CE2-CZ",
    "SER": "CA-CB CB-OG",
    "THR": "CA-CB CB-OG1 CB-CG2",
    "TRP": (
        "CA-CB CB-CG CG-CD1 CG-CD2 CD1-NE1 NE1-CE2 CD2-CE2 CD2-CE3 CE2-CZ2 CE3-CZ3 CZ2-CH2 CZ3-CH2"
    ),
    "TYR": "CA-CB CB-CG CG-CD1 CG-CD2 CD1-CE1 CD2-CE2 CE1-CZ CE2-CZ CZ-OH",
    "VAL": "CA-CB CB-CG1 CB-CG2",
}


def signed_volume(group, center, neighbors):
    origin = group[center].position
    a, b, c = [[group[name].position[i] - origin[i] for i in range(3)] for name in neighbors]
    return (
        a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])
    )


def geometry(before: dict, after: dict, tokens: list[str]) -> dict:
    maximum, bonds, centers = 0.0, 0, 0
    for token in tokens:
        left = {a.name: a for a in before.values() if a.token == token}
        right = {a.name: a for a in after.values() if a.token == token}
        residue = left["CA"].residue
        edges = ("N-CA CA-C C-O " + SIDECHAIN_BONDS[residue]).split()
        if "OXT" in left:
            edges.append("C-OXT")
        for edge in edges:
            a, b = edge.split("-")
            initial = math.dist(left[a].position, left[b].position)
            final = math.dist(right[a].position, right[b].position)
            change = abs(final - initial)
            if not 1.1 <= initial <= 2.05 or not 1.1 <= final <= 2.05 or change > 0.03:
                raise ValueError(
                    "Selected receptor residue has invalid or changed covalent geometry."
                )
            maximum, bonds = max(maximum, change), bonds + 1
        checks = [("CA", ("N", "C", "CB"))]
        if residue == "ILE":
            checks.append(("CB", ("CA", "CG1", "CG2")))
        elif residue == "THR":
            checks.append(("CB", ("CA", "OG1", "CG2")))
        for center, neighbors in checks:
            initial, final = (
                signed_volume(left, center, neighbors),
                signed_volume(right, center, neighbors),
            )
            if abs(initial) < 0.001 or abs(final) < 0.001 or initial * final <= 0:
                raise ValueError("Selected receptor residue lost its original local handedness.")
            centers += 1
    return {
        "geometry_check": "residue_bonds_and_local_handedness_v1",
        "checked_bonds": bonds,
        "checked_centers": centers,
        "maximum_bond_length_change_angstrom": maximum,
        "local_handedness_preserved": True,
    }
