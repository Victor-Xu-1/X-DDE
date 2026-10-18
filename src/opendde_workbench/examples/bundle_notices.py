"""Source and output notices describe only the archived scientific case scope."""

import json

from .catalogue import CASES, FILES, MODULES


def bundle_notices(selected, rows, *, modules=MODULES, cases=CASES, files=FILES):
    selected_cases = {modules[key].case_id for key in selected}
    selected_files = {key for case in selected_cases for key in cases[case].files}
    # Optional scientific references belong to an archive only when their exact
    # content-addressed files are actually retained. Do not add unrelated licences.
    retained_hashes = {row["sha256"] for row in rows.get("assets", [])}
    optional_files = {key for key, spec in files.items() if spec.sha256 in retained_hashes}
    selected_files.update(optional_files)
    operations = {json.loads(row["request"]).get("operation", "predict") for row in rows["jobs"]}
    licenses = sorted({files[key].license for key in selected_files})
    if any(operation.startswith("drugclip_") for operation in operations):
        licenses.append("Official DrugCLIP computed outputs: CC-BY-NC-4.0; noncommercial research")
    methods = [
        "Retained native computational measurements and predictions; not experimental affinity."
    ]
    if "regions" in selected:
        methods.append("Molecular regions are geometric annotations.")
    if "campaign" in selected:
        methods.append("Campaign is native configuration validation only.")
    if "surface_exposure" in operations:
        methods.append("SASA is geometric accessibility, not energy, affinity or linker passage.")
    if "channel_analysis" in operations:
        methods.append(
            "CAVER static geometric channels do not establish whole-drug passage, "
            "energy or affinity."
        )
    notices = {
        "sources": sorted(
            {url for case in selected_cases for url in cases[case].sources}
            | {files[key].url for key in optional_files}
        ),
        "licenses": licenses,
        "methods": " ".join(methods),
    }
    if "del-unc006-brd4" in selected_cases and cases["del-unc006-brd4"].revision >= 2:
        from .del6.catalogue import ROOT

        notices["data_attribution"] = (ROOT / "NOTICE.txt").read_text(encoding="utf-8")
    return notices
