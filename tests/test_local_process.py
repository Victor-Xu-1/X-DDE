"""Real process groups verify cancellation/recovery without scientific dependencies."""

import asyncio
import os
import sys
from pathlib import Path

from opendde_workbench import local_process


def test_local_process_cancellation_removes_parent_and_descendants(tmp_path):
    script = tmp_path / "controlled_runner.py"
    script.write_text(
        "import subprocess,sys,time\nfrom pathlib import Path\n"
        "p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'])\n"
        "Path('child.pid').write_text(str(p.pid))\nprint('ready',flush=True)\ntime.sleep(60)\n"
    )

    async def exercise():
        process = await local_process.start(
            Path(sys.executable), script, tmp_path, os.environ.copy()
        )
        assert await process.stdout.readline() == b"ready\n"
        child = int((tmp_path / "child.pid").read_text())
        await local_process.stop(script, tmp_path)
        await process.wait()
        assert not local_process.group_members(process.pid)
        if Path(f"/proc/{child}").exists():
            assert local_process.kernel_identity(child)["state"] == "Z"
        assert not (tmp_path / "process.json").exists()

    asyncio.run(exercise())
