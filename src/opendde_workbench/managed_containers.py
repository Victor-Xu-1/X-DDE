"""One registry for owned native container names and preparation lifecycle support."""

from uuid import UUID

CONTAINER_STYLES = {
    "datasets": "preparation",
    "drugclip": "preparation",
    "deli": "preparation",
    "deepternary": "preparation",
    "boltz": "preparation",
    "reinvent": "preparation",
    "ligandmpnn": "preparation",
    "boltzgen": "preparation",
    "openmm": "preparation",
    "gromacs": "preparation",
    "openfe": "preparation",
    "apbs": "preparation",
    "chemprop": "preparation",
    "plip": "preparation",
    "p2rank": "native",
    "gnina": "native",
    "chemistry": "preparation",
    "biopython": "preparation",
    "caver": "preparation",
    "anarcii": "preparation",
    "posebusters": "preparation",
    "admet": "preparation",
    "sapiens": "preparation",
}


def container_name(identifier, job_id, *, preparation=False):
    style = CONTAINER_STYLES.get(identifier)
    if style is None or (preparation and style != "preparation"):
        raise ValueError("Unknown managed native container namespace.")
    if str(UUID(job_id)) != job_id:
        raise ValueError("Native container requires a canonical task identifier.")
    return "xdde-" + identifier + "-" + job_id


def attached_container(prefix, job_id):
    identifier = prefix.removeprefix("xdde-").removesuffix("-")
    if prefix != "xdde-" + identifier + "-":
        raise ValueError("Unregistered native container prefix.")
    return container_name(identifier, job_id)
