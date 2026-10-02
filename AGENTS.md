# X-DDE development and storage

## Owner workstation

- X-DDE source work, upgrades, dependencies, downloads, caches, temporary artifacts,
  model resources and research data belong on the owner's E: workspace. C: is only
  for unavoidable operating-system or desktop-tool metadata. Do not create new
  X-DDE work/output directories in the Windows user profile.
- Windows launchers and release downloads use `E:\WSL\apps\x-dde`; development
  evidence and task plans use `E:\WSL\management\x-dde`. The OpenDDE integrated
  environment has its own Windows entry under `E:\WSL\apps\opendde`.
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
  deployment and scientific asset authorities. All other software, including
  OpenDDE, DiffSBDD and Harness, is integrated as managed environments/components.
- Preparation adapters and native scientific programs have distinct contracts.
  OpenDDE configuration currently uses the reviewed Harness installer APIs; never
  invent upstream lifecycle methods or make it own platform/scientific business.
- The reviewed environment registry is the sole task-operation/environment mapping;
  BackendRouter is the sole start/stop/recovery authority. Each new engine needs
  a real typed adapter, independent environment/model/service readiness and
  acceptance; missing OpenDDE never defines platform-wide availability.
- Keep environment and input-version provenance explicit. Preserve prior asset
  versions when editing; never turn unavailable calculations into fabricated data.
- CI uses its isolated runner workspace. Do not hard-code owner-machine paths
  into scientific algorithms or application runtime contracts.

## Verification scope

- Test changed modules and their direct consumers only. Do not run or trigger a
  global suite without the owner's explicit permission. This also applies to CI.
- Capability installation and actual public research examples are now authorized
  on the owner's E-backed environment. Preserve existing applications and data;
  do not restart the shared WSL distribution without explicit permission.
- Keep real native results distinct from public experimental references and
  runnable inputs. A download, installation or example preset is not a computed result.
