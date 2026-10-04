"""Native RDKit rule matches and chemical scaffolds; neither estimates activity."""


class AlertInspector:
    def __init__(self, selection):
        from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams

        names = {"pains": ("PAINS",), "pains_brenk": ("PAINS", "BRENK")}[selection]
        self.catalogues = []
        for name in names:
            parameters = FilterCatalogParams()
            parameters.AddCatalog(getattr(FilterCatalogParams.FilterCatalogs, name))
            catalogue = FilterCatalog(parameters)
            if not catalogue.GetNumEntries():
                raise RuntimeError("The native structural-alert catalogue is unavailable.")
            self.catalogues.append((name, catalogue))

    def inspect(self, molecule):
        return [
            {"catalogue": name, "rule": rule}
            for name, catalogue in self.catalogues
            for rule in sorted({entry.GetDescription() for entry in catalogue.GetMatches(molecule)})
        ]


def scaffold_identity(molecule):
    from rdkit import Chem
    from rdkit.Chem.Scaffolds import MurckoScaffold

    if len(Chem.GetMolFrags(molecule)) != 1:
        return None
    scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=molecule, includeChirality=True)
    if scaffold:
        return "murcko", scaffold
    # Ring-free compounds have no Murcko core. Keep distinct chemical identities;
    # never collapse all acyclic molecules into one empty-string scaffold.
    return "acyclic", Chem.MolToSmiles(molecule, isomericSmiles=True)
