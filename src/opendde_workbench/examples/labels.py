"""Curated public case labels; never rewrite researcher-authored task records."""

from ..capabilities.definitions import CAPABILITIES
from .catalogue import CASES, MODULES


def job_labels(store) -> dict[str, tuple[str, str]]:
    clauses = " OR ".join("(capability_id=? AND revision=?)" for _ in MODULES)
    parameters = tuple(value for key, module in MODULES.items() for value in (key, module.revision))
    with store.connect() as database:
        rows = database.execute(
            "SELECT capability_id,job_id FROM example_pins WHERE " + clauses, parameters
        ).fetchall()
    result = {}
    for row in rows:
        key = row["capability_id"]
        case, capability = CASES[MODULES[key].case_id], CAPABILITIES[key]
        result[row["job_id"]] = tuple(
            case.label[index] + " · " + capability.label[index] for index in range(2)
        )
    return result
