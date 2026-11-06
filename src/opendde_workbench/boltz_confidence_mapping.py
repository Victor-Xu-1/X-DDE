"""Boltz-2 2.2.1 tokenizer identities, from retained processed structure tables.

Polymer residues (including modified polymers) are tokens; nonstandard
non-polymers are atom tokens. The writer removes masked chains and emits all
remaining atoms in chain/residue/atom table order. Never infer this from B factors.
"""

from .native_arrays import read_array, records

LAYOUTS = {
    "atoms": [
        ("name", "<U4"),
        ("coords", "<f4", (3,)),
        ("is_present", "|b1"),
        ("bfactor", "<f4"),
        ("plddt", "<f4"),
    ],
    "residues": [
        ("name", "<U5"),
        ("res_type", "|i1"),
        ("res_idx", "<i4"),
        ("atom_idx", "<i4"),
        ("atom_num", "<i4"),
        ("atom_center", "<i4"),
        ("atom_disto", "<i4"),
        ("is_standard", "|b1"),
        ("is_present", "|b1"),
    ],
    "chains": [
        ("name", "<U5"),
        ("mol_type", "|i1"),
        ("entity_id", "<i4"),
        ("sym_id", "<i4"),
        ("asym_id", "<i4"),
        ("atom_idx", "<i4"),
        ("atom_num", "<i4"),
        ("res_idx", "<i4"),
        ("res_num", "<i4"),
        ("cyclic_period", "<i4"),
    ],
}


def table(source, key, fields, limit):
    value = read_array(source, key)
    if value.dtype != LAYOUTS[key] or len(value.shape) != 1 or not 0 < value.shape[0] <= limit:
        raise ValueError("Native Boltz identity layout is unsupported.")
    return list(records(value, fields))


def atom_tokens(source: bytes, token_count: int):
    # These are processed INPUT tables. BoltzWriter sets all remaining atom and
    # residue is_present flags True after assigning predicted coordinates and
    # before invoking to_mmcif. Filtering on input presence would discard valid
    # predicted atoms; only the chain mask controls this writer's output inventory.
    atoms = table(source, "atoms", {"name": "<U4"}, 100000)
    residues = table(
        source,
        "residues",
        {
            "name": "<U5",
            "res_idx": "<i4",
            "atom_idx": "<i4",
            "atom_num": "<i4",
            "is_standard": "|b1",
        },
        10000,
    )
    chains = table(
        source,
        "chains",
        {
            "name": "<U5",
            "mol_type": "|i1",
            "asym_id": "<i4",
            "res_idx": "<i4",
            "res_num": "<i4",
            "atom_idx": "<i4",
            "atom_num": "<i4",
        },
        256,
    )
    mask = read_array(source, "mask")
    if (
        not 0 < len(atoms) <= 100000
        or not 0 < len(residues) <= 10000
        or not 0 < len(chains) <= 256
        or mask.dtype != "|b1"
        or mask.shape != (len(chains),)
        or len(mask.body) != len(chains)
        or any(value not in (0, 1) for value in mask.body)
    ):
        raise ValueError("Native Boltz identity tables exceed their supported bounds.")
    identities, links, asym_ids = [], [], []
    used_atoms, used_residues, chain_names, chain_ids = set(), set(), set(), set()
    for chain, valid in zip(chains, mask.body, strict=True):
        if not valid:
            continue
        name, asym = chain["name"], chain["asym_id"]
        rs, rn, start, size = (chain[k] for k in ("res_idx", "res_num", "atom_idx", "atom_num"))
        if (
            not name
            or name in chain_names
            or asym < 0
            or asym in chain_ids
            or chain["mol_type"] not in (0, 1, 2, 3)
            or not 0 <= rs < rs + rn <= len(residues)
            or not 0 <= start < start + size <= len(atoms)
        ):
            raise ValueError("Native Boltz chain identity is ambiguous.")
        chain_names.add(name)
        chain_ids.add(asym)
        numbers, cursor = set(), start
        for index in range(rs, rs + rn):
            residue = residues[index]
            first, count = residue["atom_idx"], residue["atom_num"]
            number = residue["res_idx"] + 1
            if (
                index in used_residues
                or not residue["name"]
                or not 1 <= number <= 100000
                or number in numbers
                or first != cursor
                or not first < first + count <= start + size
            ):
                raise ValueError("Native Boltz residue ranges are inconsistent.")
            used_residues.add(index)
            numbers.add(number)
            atom_level = chain["mol_type"] == 3 and not residue["is_standard"]
            names = set()
            for atom_index in range(first, first + count):
                atom = atoms[atom_index]["name"]
                if not atom or atom in names or atom_index in used_atoms:
                    raise ValueError("Native Boltz atom identity is ambiguous.")
                names.add(atom)
                used_atoms.add(atom_index)
                identities.append([name, residue["name"], number, atom])
                links.append(len(asym_ids))
                if atom_level:
                    asym_ids.append(asym)
            if not atom_level:
                asym_ids.append(asym)
            cursor = first + count
        if cursor != start + size:
            raise ValueError("Native Boltz chain atoms are incomplete.")
    if not identities or len(asym_ids) != token_count:
        raise ValueError("Native Boltz token count differs from its confidence.")
    return identities, links, asym_ids
