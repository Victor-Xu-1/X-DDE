"""Real offline library selection using the reviewed native RDKit implementation."""

import hashlib

from screen_inspection import AlertInspector
from screen_io import read_sdf, valid_molecule
from screen_options import ScreenOptions
from screen_record import evaluate_record
from screen_report import write_report
from screen_selection import annotate_unselected, select_indices


def run_screen(request, bindings, directory, output):
    from rdkit import Chem, rdBase
    from rdkit.Chem import rdFingerprintGenerator

    options = ScreenOptions.model_validate(request["options"])
    supplier = read_sdf(request["library"], bindings, directory)
    generator = rdFingerprintGenerator.GetMorganGenerator(
        radius=2, fpSize=2048, includeChirality=True
    )
    inspector = AlertInspector(options.alert_catalogue) if options.alert_policy != "off" else None
    query, query_fp = None, None
    if options.mode in {"similarity", "substructure"}:
        reference = request.get("query")
        if not reference:
            raise ValueError("This search requires one exact query molecular record.")
        query_records = read_sdf(reference, bindings, directory)
        record = reference["record"]
        if (
            isinstance(record, bool)
            or not isinstance(record, int)
            or not 0 <= record < len(query_records)
        ):
            raise ValueError("Query record is missing.")
        query = valid_molecule(query_records[record])
        query_fp = generator.GetFingerprint(query)
    rows, fingerprints, seen, groups = [], {}, {}, {}
    for record, molecule in enumerate(supplier):
        row, fingerprint = evaluate_record(
            record, molecule, options, generator, query, query_fp, inspector, seen, groups
        )
        rows.append(row)
        if fingerprint is not None:
            fingerprints[record] = fingerprint
    selected = select_indices(rows, fingerprints, options)
    artifact = "selected.sdf"
    with Chem.SDWriter(str(output / artifact)) as writer:
        for output_record, record in enumerate(selected):
            writer.write(supplier[record])
            rows[record].update(selected=True, output_record=output_record)
    annotate_unselected(rows, selected, options)
    report_artifact, report_sha256 = write_report(rows, output)
    digest = hashlib.sha256((output / artifact).read_bytes()).hexdigest()
    return {
        "operation": "library_screen",
        "complete": True,
        "schema_version": 2,
        "library": request["library"],
        "query": request.get("query"),
        "options": options.model_dump(mode="json"),
        "rows": rows,
        "selected_records": selected,
        "artifact": artifact,
        "sha256": digest,
        "report_artifact": report_artifact,
        "report_sha256": report_sha256,
        "scaffold_groups": list(groups.values()) if options.mode == "scaffold" else None,
        "scaffold_method": "murcko_chiral_acyclic_exact" if options.mode == "scaffold" else None,
        "versions": {"rdkit": rdBase.rdkitVersion},
        "fingerprint": {"method": "Morgan", "radius": 2, "bits": 2048, "chirality": True},
        "scope": "chemical_library_selection_not_activity_admet_or_binding_prediction",
        "chemical_processing": "original_records_no_salt_stripping_or_state_enumeration",
        "coordinate_frame": "retained_input_coordinates_not_inferred_binding_pose",
    }
