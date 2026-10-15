"""Chemical scaffold checks; atom coordinates are never fixed or rewritten."""


class ScaffoldScope:
    def __init__(self, smiles):
        from rdkit import Chem

        source = Chem.MolFromSmiles(smiles)
        if source is None:
            raise ValueError("The attachment-point scaffold cannot be parsed.")
        source = Chem.RemoveHs(source)
        if len(Chem.GetMolFrags(source)) != 1:
            raise ValueError("Choose one connected R-group scaffold.")
        dummies = [atom for atom in source.GetAtoms() if atom.GetAtomicNum() == 0]
        if not dummies or any(
            atom.GetDegree() != 1 or atom.GetBonds()[0].GetBondType() != Chem.BondType.SINGLE
            for atom in dummies
        ):
            raise ValueError("Mark each R-group site with a single-bonded attachment point (*).")
        self.attributes = {
            atom.GetIdx(): self.atom_identity(atom)
            for atom in source.GetAtoms()
            if atom.GetAtomicNum() != 0
        }
        if not self.attributes:
            raise ValueError("The scaffold needs a real chemical core.")
        # Temporary maps retain source identities through aromatic/stereo-aware
        # SMILES normalization. They do not alter the submitted scaffold or files.
        mapped = Chem.Mol(source)
        for atom in mapped.GetAtoms():
            atom.SetAtomMapNum(atom.GetIdx() + 1)
        self.query = Chem.MolFromSmarts(
            Chem.MolToSmiles(mapped, canonical=False, isomericSmiles=True)
        )
        if self.query is None:
            raise ValueError("The declared scaffold cannot form a chemical query.")
        self.query_sources = [atom.GetAtomMapNum() - 1 for atom in self.query.GetAtoms()]
        self.sites = len(dummies)

    @staticmethod
    def atom_identity(atom):
        return (
            atom.GetAtomicNum(),
            atom.GetFormalCharge(),
            atom.GetIsotope(),
            atom.GetIsAromatic(),
            atom.GetDegree(),
            atom.GetTotalNumHs(includeNeighbors=True),
            atom.GetNumRadicalElectrons(),
        )

    def matches(self, molecule):
        from rdkit import Chem

        if molecule is None:
            return False
        target = Chem.RemoveHs(molecule)
        if len(Chem.GetMolFrags(target)) != 1 or any(
            atom.GetAtomicNum() == 0 for atom in target.GetAtoms()
        ):
            return False
        for match in target.GetSubstructMatches(
            self.query, useChirality=True, uniquify=False, maxMatches=512
        ):
            if all(
                self.atom_identity(target.GetAtomWithIdx(match[index])) == self.attributes[source]
                for index, source in enumerate(self.query_sources)
                if source in self.attributes
            ):
                return True
        return False
