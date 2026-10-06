"""Bounded record iteration preserves original identifiers, salts and stereochemistry."""

import csv

from platformnative_io import text_lines


def records(path, options):
    from rdkit import Chem

    lines = text_lines(path, options["expanded_bytes"])
    if path.name.removesuffix(".gz").endswith(".sdf"):
        block, size = [], 0
        for line in lines:
            if line.strip() == "$$$$":
                yield sdf_record("".join(block), options, Chem)
                block, size = [], 0
            else:
                size += len(line)
                if size > 4 * 1024**2:
                    raise ValueError("A molecular record exceeds the supported record budget.")
                block.append(line)
        if any(line.strip() for line in block):
            raise ValueError("The last SDF record is truncated; no library was published.")
        return
    if path.name.removesuffix(".gz").endswith((".smi", ".smiles")):
        for line in lines:
            if line.strip() and not line.lstrip().startswith("#"):
                values = line.strip().split(maxsplit=1)
                yield values[1] if len(values) > 1 else "", values[0], None
        return
    csv.field_size_limit(1024**2)
    reader = csv.DictReader(lines, delimiter=options["delimiter"])
    fields = reader.fieldnames or []
    if len(fields) != len(set(fields)) or options["smiles_column"] not in fields:
        raise ValueError("Choose the actual unique SMILES and compound-ID columns.")
    if options["id_column"] not in fields:
        raise ValueError("The selected supplier compound-ID column is absent.")
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("A compound row has a different column count from the header.")
        yield row[options["id_column"]], row[options["smiles_column"]], None


def sdf_record(block, options, chem):
    molecule = chem.MolFromMolBlock(block.split("\n> ")[0], sanitize=True, removeHs=False)
    identifier = block.splitlines()[0] if block else ""
    # SDMolSupplier's record parser preserves SD properties as well as coordinates.
    supplier = chem.SDMolSupplier()
    supplier.SetData(block + "$$$$\n", sanitize=True, removeHs=False)
    molecule = supplier[0] if len(supplier) else molecule
    if molecule is not None and molecule.HasProp(options["id_column"]):
        identifier = molecule.GetProp(options["id_column"])
    return identifier, "", molecule


def chemistry(molecule):
    from rdkit import Chem
    from rdkit.Chem import QED, Crippen, Descriptors, Lipinski, rdMolDescriptors

    smiles = Chem.MolToSmiles(molecule, isomericSmiles=True, canonical=True)
    return smiles, {
        "mw": Descriptors.MolWt(molecule),
        "logp": Crippen.MolLogP(molecule),
        "tpsa": rdMolDescriptors.CalcTPSA(molecule),
        "qed": QED.qed(molecule),
        "hbd": Lipinski.NumHDonors(molecule),
        "hba": Lipinski.NumHAcceptors(molecule),
        "rotatable": Lipinski.NumRotatableBonds(molecule),
    }


def unbound_conformer(molecule, seed):
    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.AddHs(Chem.Mol(molecule))
    mol.RemoveAllConformers()
    parameters = AllChem.ETKDGv3()
    parameters.randomSeed = seed
    parameters.numThreads = 1
    parameters.maxIterations = 1000
    if AllChem.EmbedMolecule(mol, parameters) < 0:
        raise ValueError("A valid unbound conformer could not be generated.")
    # Encoding uses a seeded ETKDG conformer. No affinity or optimized pose is claimed.
    return Chem.RemoveHs(mol)
