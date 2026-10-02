"""Resolve fixed case references through the existing scientific record authorities."""

import json

from ..pose_ensembles.collections import PoseSets
from ..pose_ensembles.storage import Explorations
from ..research.receptor_sets import ReceptorSets
from ..research.regions import RegionRecords
from ..sites.storage import SiteSets
from ..workflows.storage import WorkflowRecords
from .pin_validation import validate_case_job


def record_source(capability, identifier, run_id, store, assets, settings):
    workflows = WorkflowRecords(store)
    if capability == "regions":
        value = RegionRecords(store, assets, settings).get(identifier)
        return {"kind": capability, "value": value}, [value["body"]["identity_job"]]
    if capability == "campaign":
        with store.connect() as db:
            row = db.execute("SELECT * FROM design_plans WHERE id=?", (str(identifier),)).fetchone()
        if row is None or row["state"] != "validated":
            raise ValueError("The campaign example requires native input validation.")
        value = dict(row)
        value["config"] = json.loads(value["config"])
        # Native validation is a configuration result, never a completed design campaign.
        jobs = value["config"].get("benchmark_metadata", {}).get("source_job_ids", [])
        value["summary"] = json.loads(value["summary"]) if value.get("summary") else None
        return {"kind": capability, "value": value}, jobs
    if capability == "pose_exploration":
        value = Explorations(store, assets, settings).get(identifier).model_dump(mode="json")
        plan_id = value["plan_id"]
        sites = SiteSets(store, assets, settings).get(value["request"]["site_set_id"])
        ensemble = ReceptorSets(store, assets).get(sites.request.ensemble_id)
        result = {
            "kind": capability,
            "value": value,
            "sites": sites.model_dump(mode="json"),
            "ensemble": ensemble.model_dump(mode="json"),
        }
    elif capability == "workflows":
        value = workflows.plan(identifier)
        plan_id = value["id"]
        result = {"kind": capability, "value": value}
    else:
        raise ValueError("This capability uses a task result, not a compound record.")
    if run_id is None:
        raise ValueError("The fixed workflow example requires its completed native run.")
    run = workflows.run(run_id)
    if run["plan_id"] != str(plan_id) or run["state"] != "succeeded":
        raise ValueError("The fixed example requires a successful run of this exact plan.")
    final = {}
    for attempt in run["attempts"]:
        final[attempt["step_id"]] = attempt
    if not final or any(row["status"] != "succeeded" for row in final.values()):
        raise ValueError("The fixed workflow has no complete successful native task evidence.")
    result["run"] = run
    jobs = [row["job_id"] for row in final.values()]
    if capability == "pose_exploration":
        result["poses"] = [
            item.model_dump(mode="json")
            for item in PoseSets(store, assets, settings).list(exploration_id=identifier)
            if str(item.run_id) == str(run_id)
        ]
        if len(result["poses"]) != 1 or result["poses"][0]["qualified_pose_count"] < 1:
            raise ValueError("The pose example requires a captured native pose collection.")
        jobs += [str(ensemble.source_job)]
        jobs += [str(observation.source_job) for observation in sites.observations]
    return result, jobs


def validate_record_source(capability, source, prepared, store):
    value = source["value"]
    if capability == "regions":
        expected = prepared.objects["mz1_molecule"].reference.model_dump(mode="json")
        if value["body"]["subject"] != expected:
            raise ValueError("The annotated region must use the exact public MZ1 molecule.")
        job = store.get(value["body"]["identity_job"])
        if job.request.operation != "diffsbdd" or job.request.payload.mode != "identity":
            raise ValueError("Regions require genuine native atom identities.")
        return
    if capability == "workflows":
        from ..workflows.contracts import PlanInput
        from .workflow import example_workflow

        expected = PlanInput.model_validate(example_workflow(prepared.objects))
        actual = PlanInput.model_validate(value["body"])
        if actual.model_copy(update={"name": expected.name}) != expected:
            raise ValueError("The fixed pipeline must use the reviewed public native task handoff.")
        return
    if capability == "pose_exploration":
        ligand = prepared.objects["jq1"].reference.model_dump(mode="json")
        if any(row["reference"] != ligand for row in value["request"]["ligands"]):
            raise ValueError("The pose case must use the original public JQ1 molecular version.")
        validate_case_job(
            "biopython.ensemble", store.get(source["ensemble"]["source_job"]), prepared, store
        )
        return
    if capability == "campaign":
        config = value["config"]
        draft = prepared.campaign_draft
        if not draft or config.get("target", {}).get("chains") != draft["targets"]:
            raise ValueError("The campaign target does not match the deposited HER2 construct.")
        binders = config.get("initial_binders", [])
        expected = {
            chain: {
                "sequence": sequence,
                "chain_type": "VH" if chain == "B" else "VL",
                "cdr_regions": draft["cdr"][chain],
                "fixed_residues": draft["fixed"][chain],
            }
            for chain, sequence in draft["binders"].items()
        }
        if len(binders) != 1 or binders[0].get("chains") != expected:
            raise ValueError(
                "The campaign must preserve native domains, CDR identities and fixed framework."
            )
        if config.get("benchmark_metadata", {}).get("source_job_ids") != [
            str(prepared.objects["variable_domains"].source_job)
        ]:
            raise ValueError("The campaign requires its retained native domain evidence.")
