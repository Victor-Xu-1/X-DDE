"""Public dataset pins require reviewed input bytes and completed same-case stage lineage."""

from ..assets import AssetStore
from ..datasets.bindings import resolve_source
from .catalogue import FILES


def validate_dataset_case(job, prepared, store):
    assets = AssetStore(store, store.path.parent / "assets")
    allowed = {FILES[key].sha256 for key in prepared.case.files}
    if any(
        item.source.sha256 not in allowed
        or assets.get(item.source.asset_id).sha256 != item.source.sha256
        for item in job.request.inputs
    ):
        raise ValueError("Every public dataset input must match the reviewed case source bytes.")
    pending, visited = [job], set()
    while pending:
        current = pending.pop()
        if current.id in visited:
            continue
        visited.add(current.id)
        if len(visited) > 30:
            raise ValueError("The public dataset case exceeds its reviewed lineage budget.")
        if not current.request.inputs and not current.request.sources:
            raise ValueError("A public dataset stage requires source-backed scientific materials.")
        if any(
            item.source.sha256 not in allowed
            or assets.get(item.source.asset_id).sha256 != item.source.sha256
            for item in current.request.inputs
        ):
            raise ValueError("A dataset ancestor contains input bytes outside this public case.")
        for source in current.request.sources:
            ancestor, _, _ = resolve_source(store, store.path.parent, source, full_hash=True)
            pending.append(ancestor)
