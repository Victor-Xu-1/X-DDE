"""Reviewed supplier directory: source permission and actual data readiness stay explicit."""

SUPPLIERS = (
    ("mce", "MedChemExpress", "mce", "https://file.medchemexpress.com/screening-libraries.html"),
    ("aa-blocks", "AA Blocks", "tsbiochem", ""),
    ("alchemeco", "AlchemEco", "tsbiochem", ""),
    ("alinda", "Alinda Chemical", "tsbiochem", ""),
    ("analyticon", "Analyticon", "tsbiochem", ""),
    ("anymole", "AnyMole", "tsbiochem", ""),
    ("apollo", "Apollo", "tsbiochem", ""),
    ("aronis", "Aronis", "tsbiochem", ""),
    ("asinex", "Asinex", "tsbiochem", ""),
    ("bionet", "BIONET / Key Organics", "tsbiochem", ""),
    ("chembridge", "ChemBridge", "tsbiochem", ""),
    ("chemdiv", "ChemDiv", "tsbiochem", "https://www.chemdiv.com/catalog/how-to-search-and-order/"),
    ("chemical-block", "Chemical Block", "tsbiochem", ""),
    ("chemrar", "ChemRar", "tsbiochem", ""),
    (
        "enamine",
        "Enamine",
        "tsbiochem",
        "https://enamine.net/compound-collections/screening-collection",
    ),
    ("evoblocks", "EvoBlocks", "tsbiochem", ""),
    ("eximed", "Eximed", "tsbiochem", ""),
    ("fch", "FCH Group", "tsbiochem", ""),
    ("hts-biochemie", "HTS Biochemie Innovationen", "tsbiochem", ""),
    ("innovapharm", "Innovapharm", "tsbiochem", ""),
    ("interbioscreen", "InterBioScreen", "tsbiochem", ""),
    ("labnetwork", "LabNetwork", "tsbiochem", ""),
    ("leadgen", "Leadgen Labs", "tsbiochem", ""),
    ("lifechemicals", "Life Chemicals", "tsbiochem", ""),
    ("maybridge", "Maybridge", "tsbiochem", ""),
    ("menai", "Menai Organics", "tsbiochem", ""),
    ("otava", "Otava", "tsbiochem", ""),
    ("pharmablock", "PharmaBlock", "tsbiochem", ""),
    ("pharmeks", "Pharmeks", "tsbiochem", ""),
    ("princeton", "Princeton BioMolecular Research", "tsbiochem", ""),
    ("specs", "Specs", "tsbiochem", ""),
    (
        "targetmol",
        "TargetMol",
        "tsbiochem",
        "https://www.tsbiochem.com/library-sorting-1/research_field",
    ),
    ("timtec", "TimTec", "tsbiochem", ""),
    ("ukrorg", "UkrOrgSynthesis", "tsbiochem", ""),
    ("vitas-m", "Vitas-M", "tsbiochem", ""),
)


def catalogue():
    return [
        {
            "id": identifier,
            "name": name,
            "directory_group": group,
            "catalogue_url": url or None,
            "connection": "official_download_or_owned_file",
            "formats": ["sdf", "csv", "tsv", "smiles"],
            "availability_claim": "file_import_does_not_confirm_supplier_stock",
        }
        for identifier, name, group, url in SUPPLIERS
    ]
