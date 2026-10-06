"""Reviewed supplier directory: source permission and actual data readiness stay explicit."""

SUPPLIERS = (
    ("mce", "MedChemExpress", "mce", "https://www.medchemexpress.com/screening-libraries.html"),
    ("aa-blocks", "AA Blocks", "tsbiochem", "https://www.aablocks.com/index"),
    ("alchemeco", "AlchemEco", "tsbiochem", ""),
    ("alinda", "Alinda Chemical", "tsbiochem", "https://alindachemical.com/bases_en.html"),
    (
        "analyticon",
        "Analyticon",
        "tsbiochem",
        "https://ac-discovery.com/screening-library-downloads/",
    ),
    ("anymole", "AnyMole", "tsbiochem", "https://www.anymole.com/"),
    ("apollo", "Apollo", "tsbiochem", ""),
    ("aronis", "Aronis", "tsbiochem", "https://aronis.ru/databases.html"),
    ("asinex", "Asinex", "tsbiochem", "https://www.asinex.com/screening-libraries"),
    (
        "bionet",
        "BIONET / Key Organics",
        "tsbiochem",
        "https://www.keyorganics.net/downloads-bionet-databases/",
    ),
    ("chembridge", "ChemBridge", "tsbiochem", "https://chembridge.com/"),
    ("chemdiv", "ChemDiv", "tsbiochem", "https://www.chemdiv.com/catalog/"),
    ("chemical-block", "Chemical Block", "tsbiochem", "https://www.chemical-block.com/"),
    ("chemrar", "ChemRar", "tsbiochem", "https://mol.chemrar.ru/diversity-libraries"),
    (
        "enamine",
        "Enamine",
        "tsbiochem",
        "https://enamine.net/compound-collections/screening-collection",
    ),
    ("evoblocks", "EvoBlocks", "tsbiochem", ""),
    ("eximed", "Eximed", "tsbiochem", "https://eximedlab.com/libraries.html"),
    ("fch", "FCH Group", "tsbiochem", ""),
    (
        "hts-biochemie",
        "HTS Biochemie Innovationen",
        "tsbiochem",
        "https://www.hts-biochemie.de/hts-en/produkte/screening-compounds.php?navid=349675349675",
    ),
    ("innovapharm", "Innovapharm", "tsbiochem", "https://innovapharm.com.ua/"),
    ("interbioscreen", "InterBioScreen", "tsbiochem", "https://www.ibscreen.com/bases"),
    ("labnetwork", "LabNetwork", "tsbiochem", ""),
    ("leadgen", "Leadgen Labs", "tsbiochem", "https://www.leadgenlabs.com/"),
    ("lifechemicals", "Life Chemicals", "tsbiochem", "https://lifechemicals.com/downloads"),
    (
        "maybridge",
        "Maybridge",
        "tsbiochem",
        "https://www.thermofisher.com/sa/en/home/industrial/pharma-biopharma/drug-discovery-development/screening-compounds-libraries-hit-identification/maybridge-fragment-libraries.html",
    ),
    ("menai", "Menai Organics", "tsbiochem", "https://menaiorganics.com/index.html"),
    (
        "otava",
        "Otava",
        "tsbiochem",
        "https://www.otavachemicals.com/products/compound-libraries-for-hts/drug-like-green-collection",
    ),
    ("pharmablock", "PharmaBlock", "tsbiochem", "https://usa.pharmablock.com/download.html"),
    ("pharmeks", "Pharmeks", "tsbiochem", "https://www.pharmeks.com/prod.shtml"),
    (
        "princeton",
        "Princeton BioMolecular Research",
        "tsbiochem",
        "https://princetonbio.com/request_catalog",
    ),
    ("specs", "Specs", "tsbiochem", "https://www.specs.net/"),
    (
        "targetmol",
        "TargetMol",
        "tsbiochem",
        "https://www.targetmol.com/compound-library/bioactive_compound_library",
    ),
    (
        "timtec",
        "TimTec",
        "tsbiochem",
        "https://www.timtec.net/index.php/news/faqs/home/software/home/download-databases.html",
    ),
    ("ukrorg", "UkrOrgSynthesis", "tsbiochem", ""),
    ("vitas-m", "Vitas-M", "tsbiochem", "https://vitasmlab.biz/create-sdf"),
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
