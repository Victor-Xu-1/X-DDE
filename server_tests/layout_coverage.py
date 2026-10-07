"""Verify complete current-revision UI coverage across bounded Chromium groups."""

import json
import sys
from pathlib import Path

from opendde_workbench.capabilities.definitions import CAPABILITIES


def verify(root: Path, revision: str) -> dict:
    expected = {
        spec.label[0]
        for key, spec in CAPABILITIES.items()
        if spec.frontend_form and key != "resources"
    }
    groups = {}
    for file in root.rglob("layout-matrix.json"):
        report = json.loads(file.read_text())
        selection = report["selection"]
        assert selection["revision"] == revision, "Evidence belongs to another revision"
        assert not report["errors"], report["errors"]
        assert len(selection["widths"]) == 1
        width, shard = selection["widths"][0], selection["shard"]
        assert width in {1440, 390} and shard in {0, 1}
        assert (width, shard) not in groups, "Duplicate browser group"
        selected = selection["selected_tasks"]
        assert len(selected) == len(set(selected)) and set(selected) <= expected
        pages = [row for row in report["pages"] if row["module"] in expected]
        assert {row["module"] for row in pages} == set(selected), "Unexpected task coverage"
        assert all(row["width"] == width and not row["overflow"] for row in pages)
        for row in report["pages"]:
            name = row["screenshot"]
            assert Path(name).name == name and (file.parent / name).is_file(), name
        assert len({(row["module"], row["stage"]) for row in pages}) == len(pages)
        for name in selected:
            stages = {row["stage"] for row in pages if row["module"] == name}
            assert {"new", "step-1"} <= stages, (name, stages)
            assert stages & {"result", "reviewed-input-template"}, (name, stages)
        groups[width, shard] = (set(selected), report["pages"])
    assert set(groups) == {(width, shard) for width in (1440, 390) for shard in (0, 1)}
    totals = {}
    for width in (1440, 390):
        first, second = groups[width, 0], groups[width, 1]
        assert not first[0] & second[0], "Task groups overlap"
        assert first[0] | second[0] == expected, "A task was omitted"
        utility = {row["module"] for row in first[1] if row["stage"] == "utility"}
        assert len(utility) == 8 and all(row["width"] == width for row in first[1])
        totals[width] = {"tasks": len(expected), "states": len(first[1]) + len(second[1])}
    return {"revision": revision, "widths": totals, "errors": []}


if __name__ == "__main__":
    print(json.dumps(verify(Path(sys.argv[1]), sys.argv[2]), ensure_ascii=False))
