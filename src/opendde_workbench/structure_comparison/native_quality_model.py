"""Adapt verified Bio.PDB polymer objects, avoiding DockQ's HETATM-discarding parser."""


def address(residue):
    return residue.id[1], residue.id[2].strip()


def heavy_coordinates(model):
    return {
        (chain.id, *address(residue), residue.resname, atom.id): tuple(map(float, atom.coord))
        for chain in model
        for residue in chain
        for atom in residue
        if atom.element not in {"H", "D", "T"}
    }


def quality_model(model, parent_codes, identity):
    expected = heavy_coordinates(model)
    native = model.copy()
    # Native cached functions must not alias identically named chains from distinct inputs.
    native.id = identity
    for chain in native:
        chain.sequence = "".join(parent_codes[(chain.id, *address(residue))] for residue in chain)
        chain.is_het = False
        for residue in chain:
            for atom in list(residue):
                if atom.element in {"H", "D", "T"}:
                    residue.detach_child(atom.id)
    if heavy_coordinates(native) != expected:
        raise ValueError("DockQ adaptation changed source heavy atoms, identities or coordinates.")
    return native


def explicit_alignment(reference, moving, pairs):
    fixed, mobile = list(reference), list(moving)
    left = {address(residue): index for index, residue in enumerate(fixed)}
    right = {address(residue): index for index, residue in enumerate(mobile)}
    if len(left) != len(fixed) or len(right) != len(mobile):
        raise ValueError("Native interface residue identities are not unique.")
    indices = sorted(
        (
            left[(a[2]["number"], a[2]["insertion_code"])],
            right[(b[2]["number"], b[2]["insertion_code"])],
        )
        for a, b in pairs
    )
    if any(b[1] <= a[1] or b[0] <= a[0] for a, b in zip(indices, indices[1:], strict=False)):
        raise ValueError("The explicit residue correspondence crosses native sequence order.")
    model_sequence, markers, native_sequence = [], [], []
    i, j = 0, 0
    matched = []
    for fi, mj in indices:
        while i < fi:
            model_sequence.append("-")
            markers.append(" ")
            native_sequence.append(reference.sequence[i])
            i += 1
        while j < mj:
            model_sequence.append(moving.sequence[j])
            markers.append(" ")
            native_sequence.append("-")
            j += 1
        same = reference.sequence[fi] == moving.sequence[mj]
        model_sequence.append(moving.sequence[mj])
        markers.append("|" if same else ".")
        native_sequence.append(reference.sequence[fi])
        if same:
            matched.append(
                {
                    "reference_number": fixed[fi].id[1],
                    "reference_insertion": fixed[fi].id[2].strip(),
                    "moving_number": mobile[mj].id[1],
                    "moving_insertion": mobile[mj].id[2].strip(),
                }
            )
        i, j = fi + 1, mj + 1
    model_sequence.extend("-" * (len(fixed) - i))
    markers.extend(" " * (len(fixed) - i))
    native_sequence.extend(reference.sequence[i:])
    model_sequence.extend(moving.sequence[j:])
    markers.extend(" " * (len(mobile) - j))
    native_sequence.extend("-" * (len(mobile) - j))
    if len(matched) < 3:
        raise ValueError(
            "Native backbone interface scoring requires three identical mapped residues."
        )
    return tuple("".join(value) for value in (model_sequence, markers, native_sequence)), matched
