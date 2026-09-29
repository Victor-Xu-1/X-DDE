"""Ship the Vite application inside the installable Python wheel."""

from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        if self.target_name != "wheel":
            return
        web = Path(self.root) / "src/opendde_workbench/web"
        if not (web / "index.html").is_file() or not (web / "viewer.html").is_file():
            raise RuntimeError(
                "Build the web frontend first: cd frontend && npm ci && npm run build"
            )
        build_data["force_include"][str(web)] = "opendde_workbench/web"
