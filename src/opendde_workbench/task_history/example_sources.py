"""Read case identities from existing immutable pins; never infer from task names."""

import json

from ..examples.catalogue import CASES, MODULES
from ..examples.contracts import ExamplePin, ExampleRecordPin
from ..examples.stat6.catalogue import CASE
from ..examples.stat6.catalogue import MODULES as STUDY_MODULES


def case_index(db):
    profiles = {
        (module.capability_id, module.case_id, module.revision): CASES[module.case_id]
        for module in MODULES.values()
    }
    profiles.update(
        {
            (module.capability_id, module.case_id, module.revision): CASE
            for module in STUDY_MODULES.values()
        }
    )
    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    active = json.dumps(sorted({(capability, revision) for capability, _, revision in profiles}))
    result = {}
    for table, contract in (
        ("example_pins", ExamplePin),
        ("example_record_pins", ExampleRecordPin),
    ):
        if table not in tables:
            continue
        for row in db.execute(
            "SELECT capability_id,revision,body FROM " + table + " "
            "WHERE (capability_id,revision) IN "
            "(SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?))",
            (active,),
        ):
            pin = contract.model_validate_json(row["body"])
            case = profiles.get((pin.capability_id, pin.case_id, pin.revision))
            if (
                case is None
                or row["capability_id"] != pin.capability_id
                or row["revision"] != pin.revision
            ):
                raise ValueError("The retained case identity differs from its reviewed profile.")
            jobs = (
                (pin.job_id,)
                if isinstance(pin, ExamplePin)
                else tuple(item.job_id for item in pin.evidence)
            )
            for identifier in jobs:
                result.setdefault(str(identifier), {})[case.id] = {
                    "id": case.id,
                    "label": case.label,
                }
    return {
        key: [values[identifier] for identifier in sorted(values)] for key, values in result.items()
    }


def matching_case_jobs(index, query):
    term = query.strip().casefold()
    if not term:
        return []
    return sorted(
        identifier
        for identifier, cases in index.items()
        if any(term in " ".join((case["id"], *case["label"])).casefold() for case in cases)
    )
