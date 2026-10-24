"""Measure the actual isolated native adapter; never promote its output to an example."""

import json
import os
import resource
import runpy
import sys
from pathlib import Path

sys.path.insert(0, "/platform")
limit = int(os.environ["XDDE_PROFILE_LIMIT_MIB"]) * 1024**2
cgroup = Path("/sys/fs/cgroup")
assert int((cgroup / "memory.max").read_text()) == limit
assert (cgroup / "memory.swap.max").read_text().strip() == "0"
complete = False
try:
    try:
        runpy.run_path("/platform/runner.py", run_name="__main__")
    except SystemExit as error:
        if error.code not in (None, 0):
            raise
    complete = True
finally:
    events = dict(line.split() for line in (cgroup / "memory.events").read_text().splitlines())
    value = {
        "adapter_completed": complete,
        "cgroup_limit_bytes": limit,
        "cgroup_peak_bytes": int((cgroup / "memory.peak").read_text()),
        "swap_max_bytes": 0,
        "oom_events": int(events["oom"]),
        "oom_kill_events": int(events["oom_kill"]),
        "self_peak_rss_bytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
        "child_peak_rss_bytes": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss * 1024,
        "runtime_versions": {
            name: getattr(sys.modules.get(name), "__version__", None)
            for name in ("torch", "dgl", "rdkit", "Bio")
        },
        "scientific_accuracy_accepted": False,
        "owner_frontend_task": False,
    }
    Path("/output/resource-profile.json").write_text(json.dumps(value, indent=2))
