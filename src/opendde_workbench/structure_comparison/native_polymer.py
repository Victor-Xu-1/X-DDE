"""Only deposited polymer observations enter structural comparison, including modifications."""


def modification_rows(file):
    rows = []
    if file.suffix == ".pdb":
        for line in file.read_text().splitlines():
            if line.startswith("MODRES"):
                rows.append(
                    (
                        line[16],
                        int(line[18:22]),
                        line[22].strip(),
                        line[12:15].strip(),
                        line[24:27].strip(),
                    )
                )
    else:
        from Bio.PDB.MMCIF2Dict import MMCIF2Dict

        data = MMCIF2Dict(str(file))
        fields = ["auth_asym_id", "auth_seq_id", "PDB_ins_code", "auth_comp_id", "parent_comp_id"]
        values = [data.get("_pdbx_struct_mod_residue." + key, []) for key in fields]
        if len({len(value) for value in values}) != 1:
            raise ValueError("Deposited modified-polymer annotations are incomplete.")
        for chain, number, insertion, name, parent in zip(*values, strict=True):
            rows.append(
                (chain, int(number), "" if insertion in {".", "?"} else insertion, name, parent)
            )
    if len({row[:4] for row in rows}) != len(rows):
        raise ValueError("Deposited modification identities are not unique.")
    return rows


def declared_polymers(file, model, modifications):
    chains = {chain.id for chain in model}
    if file.suffix == ".pdb":
        modified = {row[:4] for row in modifications}
        return {
            (chain.id, res.id[1], res.id[2].strip(), res.resname)
            for chain in model
            for res in chain
            if res.id[0] == " " or (chain.id, res.id[1], res.id[2].strip(), res.resname) in modified
        }
    from Bio.PDB.MMCIF2Dict import MMCIF2Dict

    data = MMCIF2Dict(str(file))
    fields = ["auth_asym_id", "auth_seq_id", "pdbx_PDB_ins_code", "label_comp_id", "label_seq_id"]
    columns = [data["_atom_site." + key] for key in fields]
    serials = data.get("_atom_site.pdbx_PDB_model_num", ["1"] * len(columns[0]))
    modified, selected = {row[:4] for row in modifications}, set()
    for values, serial in zip(zip(*columns, strict=True), serials, strict=True):
        chain, number, insertion, name, sequence = values
        if chain not in chains or int(serial) != model.serial_num:
            continue
        key = (chain, int(number), "" if insertion in {".", "?"} else insertion, name)
        if sequence not in {".", "?"} or key in modified:
            selected.add(key)
    return selected


def selected_polymer(file, model):
    from Bio.PDB.Polypeptide import protein_letters_3to1, protein_letters_3to1_extended

    modifications = modification_rows(file)
    parents = {row[:4]: row[4] for row in modifications}
    expected = declared_polymers(file, model, modifications)
    if not 1 <= len(expected) <= 5000:
        raise ValueError("Comparison accepts at most 5000 observed polymer residues per model.")
    selected, parent_codes, observed, excluded = model.copy(), {}, set(), []
    retained_modifications = []
    for chain in selected:
        for residue in list(chain):
            key = (chain.id, residue.id[1], residue.id[2].strip(), residue.resname)
            if key not in expected:
                if file.suffix == ".pdb" and residue.resname in protein_letters_3to1_extended:
                    raise ValueError(
                        "An amino-acid-like PDB HETATM lacks a source MODRES annotation. "
                        "Use the deposited mmCIF or explicitly prepare its polymer identity; "
                        "modified residues must not be silently discarded."
                    )
                excluded.append(
                    {
                        "chain": chain.id,
                        "number": residue.id[1],
                        "insertion_code": residue.id[2].strip(),
                        "residue": residue.resname,
                    }
                )
                chain.detach_child(residue.id)
                continue
            parent = parents.get(key)
            letter = (
                protein_letters_3to1.get(parent)
                if parent not in {None, ".", "?"}
                else (protein_letters_3to1_extended.get(residue.resname))
            )
            if not letter:
                raise ValueError("A selected polymer has no supported source-bound protein code.")
            if key[:3] in parent_codes:
                raise ValueError("Selected polymer author residue identities are not unique.")
            parent_codes[key[:3]] = letter
            observed.add(key)
            if parent or residue.resname not in protein_letters_3to1:
                retained_modifications.append(
                    {
                        "chain": key[0],
                        "number": key[1],
                        "insertion_code": key[2],
                        "residue": key[3],
                        "parent": parent or "?",
                        "annotation_basis": (
                            "source_modification_annotation"
                            if parent not in {None, ".", "?"}
                            else "source_polymer_membership"
                        ),
                    }
                )
    if observed != expected or not observed:
        raise ValueError("Selected polymer observations were omitted or changed by parsing.")
    if any(not len(chain) for chain in selected):
        raise ValueError("Every selected comparison chain must contain deposited protein residues.")
    return (
        selected,
        parent_codes,
        {
            "polymer_residues": len(observed),
            "chain_residue_counts": {chain.id: len(chain) for chain in selected},
            "modified_residues": retained_modifications,
            "excluded_nonpolymer_residues": excluded,
        },
    )
