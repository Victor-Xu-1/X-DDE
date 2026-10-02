"""One-shot bridge to the native Harness campaign controller (external interpreter)."""

import asyncio
import json
import sys
from pathlib import Path


def existing_plan(store, plan_id):
    matches = []
    # Unreadable native state is not proof that a launch never happened.
    for path in store.root.glob("*/workflow.json"):
        workflow = store.read_workflow(path.parent.name)
        source = workflow.metadata.get("source_config", {})
        if source.get("benchmark_metadata", {}).get("workbench_plan_id") == plan_id:
            matches.append(store.read_snapshot(path.parent.name))
    if len(matches) > 1:
        raise RuntimeError("Multiple native tasks reference this plan; inspect Harness state.")
    return matches[0].model_dump(mode="json") if matches else {"found": False}


async def execute(message):
    from harness_tools import LOCAL_MODELS, TOOLS, validate_identifier
    from opendde_harness.cli.protein_design_commands import _load_plugin_config, _workflow_summary
    from opendde_harness.plugin.protein_design.core import contracts
    from opendde_harness.plugin.protein_design.core.contracts import WorkflowConfig
    from opendde_harness.plugin.protein_design.core.detached import (
        DetachedDesignTaskController,
        TaskFileStore,
    )
    from opendde_harness.plugin.protein_design.core.preparation import preparation_context
    from opendde_harness.plugin.protein_design.core.runtime import WorkflowConfigLoader

    operation = message["operation"]
    if operation == "import_config":
        import yaml
        from harness_tools import validate_payload

        text = Path(message["path"]).read_text(encoding="utf-8-sig")
        if len(text) > 262144:
            raise ValueError("Design configuration exceeds256KiB.")
        if any(isinstance(token, yaml.tokens.AliasToken) for token in yaml.scan(text)):
            raise ValueError("Expand YAML aliases before importing a design configuration.")
        value = yaml.safe_load(text)
        if not isinstance(value, dict):
            raise ValueError("A design configuration must be an object.")
        validate_payload(value)
        return value
    if operation == "schemas":
        schemas = {
            key: getattr(contracts, model).model_json_schema()
            for key, (model, _) in TOOLS.items()
            if model
        }
        schemas.update({key: model.model_json_schema() for key, model in LOCAL_MODELS.items()})
        return {
            "tools": schemas,
            "workflow": WorkflowConfig.model_json_schema(),
        }
    if operation == "validate_tool":
        tool = message["tool"]
        model, _ = TOOLS[tool]
        if model:
            getattr(contracts, model).model_validate(message["payload"])
        else:
            LOCAL_MODELS[tool].model_validate(message["payload"])
        return {"valid": True}
    if operation == "active":
        store = TaskFileStore()
        snapshots = [
            store.read_snapshot(path.parent.name) for path in store.root.glob("*/snapshot.json")
        ]
        return [
            {"task_id": s.task_id, "status": s.status}
            for s in snapshots
            if s.status in {"queued", "running"}
        ]
    if operation == "reconcile":
        return existing_plan(TaskFileStore(), message["plan_id"])
    config = _load_plugin_config(None)
    controller = DetachedDesignTaskController(config)
    if operation == "context":
        return preparation_context(config)
    if operation in {"validate", "start"}:
        path = Path(message["config_path"])
        workflow = WorkflowConfigLoader.config_from_path(str(path), config)
        for candidate in workflow.initial_candidates:
            validate_identifier(candidate.get("candidate_id"))
        if operation == "validate":
            return {
                "summary": _workflow_summary(workflow, config),
                "workflow": workflow.model_dump(mode="json"),
            }
        # Recover a successful native handoff if the response was lost. No second campaign loop.
        plan_id = message["plan_id"]
        existing = existing_plan(TaskFileStore(), plan_id)
        if existing.get("found") is not False:
            return existing
        return (await controller.start(workflow)).model_dump(mode="json")
    task_id = message.get("task_id")
    if operation == "status":
        result = controller.status(task_id)
        return (
            [s.model_dump(mode="json") for s in result]
            if isinstance(result, list)
            else result.model_dump(mode="json")
        )
    if operation == "stop":
        return controller.stop(task_id).model_dump(mode="json")
    if operation == "adjust":
        return controller.adjust(task_id, message["adjustments"]).model_dump(mode="json")
    if operation == "candidates":
        return await controller.top_candidates(task_id, min(100, int(message.get("top_k", 20))))
    if operation == "campaign_analysis":
        from opendde_harness.plugin.protein_design.servers.compute_pool import ComputePool

        workflow = TaskFileStore().read_workflow(task_id)
        selection = await ComputePool.from_config(config).select(workflow)
        client = selection.client
        kind = message["kind"]
        if kind == "evolution":
            result = await client.analyze_evolution_tree(
                contracts.EvolutionTreeRequest(
                    task_id=task_id,
                    candidates_json_path="in-memory",
                    objective_key=workflow.objective_key,
                    minimize=workflow.minimize,
                    binder_chain_ids=list(workflow.binder_chains),
                    cdr_regions=workflow.cdr_regions,
                    cycle=max(0, controller.status(task_id).cycle),
                    reflection_interval=workflow.reflection_interval,
                )
            )
        else:
            population = await controller.top_candidates(task_id, 3)
            candidates = [c for c in population.get("candidates", []) if c.get("structure_path")]
            if not candidates:
                raise ValueError("No folded candidates are available for this analysis.")
            if kind == "structure":
                result = await client.analyze_structure(
                    contracts.StructureAnalysisRequest(
                        task_id=task_id,
                        structure_paths=[c["structure_path"] for c in candidates],
                        candidate_names=[c["candidate_id"] for c in candidates],
                        binder_chain_ids=list(workflow.binder_chains),
                        target_chain_ids=workflow.target_chain_ids,
                    )
                )
            elif kind == "epitope":
                groups = {
                    chain: {f"CDR{i + 1}": positions for i, positions in enumerate(regions)}
                    for chain, regions in workflow.cdr_region_groups.items()
                }
                result = await client.analyze_epitope(
                    contracts.EpitopeAnalysisRequest(
                        task_id=task_id,
                        structure_path=candidates[0]["structure_path"],
                        antibody_chains=list(workflow.binder_chains),
                        antigen_chains=workflow.target_chain_ids,
                        cdr_regions=groups,
                    )
                )
            else:
                raise ValueError("Unknown campaign report.")
        return result.model_dump(mode="json")
    if operation == "candidate_structure":
        from opendde_harness.plugin.protein_design.servers.compute_pool import ComputePool

        population = await controller.top_candidates(task_id, 100)
        candidate = next(
            (
                c
                for c in population.get("candidates", [])
                if c.get("candidate_id") == message["candidate_id"]
            ),
            None,
        )
        if not candidate or not candidate.get("structure_path"):
            raise ValueError("This candidate has no available structure.")
        workflow = TaskFileStore().read_workflow(task_id)
        selection = await ComputePool.from_config(config).select(workflow)
        structure = await selection.client.read_structure(
            candidate["structure_path"], task_id=task_id
        )
        return structure.model_dump(mode="json")
    raise ValueError("Unsupported Harness bridge operation.")


def main():
    message = json.loads(sys.stdin.read(262145))
    output = sys.stdout
    sys.stdout = sys.stderr
    try:
        result = asyncio.run(execute(message))
        response = {"ok": True, "result": result}
    except Exception as exc:
        response = {"ok": False, "error": str(exc)[:1500], "kind": type(exc).__name__}
    output.write(json.dumps(response, ensure_ascii=False, allow_nan=False))
    output.flush()


if __name__ == "__main__":
    main()
