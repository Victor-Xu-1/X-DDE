# X-DDE development and storage

## Owner workstation

- X-DDE source work, upgrades, dependencies, downloads, caches, temporary artifacts,
  model resources and research data belong on the owner's E: workspace. C: is only
  for unavoidable operating-system or desktop-tool metadata. Do not create new
  X-DDE work/output directories in the Windows user profile.
- Windows launchers and release downloads use `E:\WSL\apps\x-dde`; development
  evidence and task plans use `E:\WSL\management\x-dde`. The OpenDDE scientific
  engine has its own Windows entry under `E:\WSL\apps\opendde`.
- Verify the actual WSL registration and Docker storage before installation;
  a distribution name or Linux path does not prove the Windows drive. The current
  E: distribution preserves its existing `/opt/opendde` and `/home/opendde` paths.
  Do not rename existing virtual environments or Git worktrees for cosmetic layout.
- New Linux project, environment, data, model, cache and temporary directories use
  `/srv/wsl/projects`, `/srv/wsl/envs`, `/srv/wsl/data`, `/srv/wsl/models`,
  `/srv/wsl/cache` and `/srv/wsl/tmp`, respectively. Run Linux-intensive work in
  the Linux filesystem, not a Windows mount.
- Preserve original assets, history, user attachments and previously linked
  deliverables. Do not stop unrelated WSL distributions or migrate their disks.
- On the owner workstation, use static/build/lifecycle/UI checks. Run test suites
  in CI and scientific inference/GPU/LLM acceptance on the target server unless
  the user explicitly asks otherwise.

## Product boundaries

- Both the UI and the platform server are X-DDE. X-DDE owns the shared task,
  deployment and scientific asset authorities. OpenDDE, DiffSBDD and Harness are
  scientific engines with separately managed execution environments.
- The reviewed engine registry is the sole task-operation/engine identity mapping;
  BackendRouter is the sole start/stop/recovery authority. Each new engine needs
  a real typed adapter, independent environment/model/service readiness and
  acceptance; missing OpenDDE never defines platform-wide availability.
- Keep environment and input-version provenance explicit. Preserve prior asset
  versions when editing; never turn unavailable calculations into fabricated data.
- CI uses its isolated runner workspace. Do not hard-code owner-machine paths
  into scientific algorithms or application runtime contracts.
