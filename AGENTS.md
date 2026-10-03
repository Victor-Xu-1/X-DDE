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

## Component management

- Group components by research use without merging their isolated environments. Bundle actions request only missing, non-pending catalogue roots after a fresh snapshot; the existing server deployment queue owns dependency resolution and operation state. Explicit repair is separate from installed status.
- Use available page width with adaptive compact cards. Keep all registered components reachable, including future catalogue entries. Show one unified installation directory selector directly. Do not display completed installation history, terminal commands, raw logs, JSON dumps, digests, software manifests or engineering attachments in the user interface. Keep active, paused and latest unresolved failures visible with existing controls; retain server-side diagnostics. Scientific methods, score units, uncertainty and research files remain available.
- Installed status must not dispatch installation. Preserve optional model/database choices, individual third-party licenses, ownership and uninstall protection. Do not verify interface changes by reinstalling scientific components on the owner's shared workstation.

## Publication versions

- Every publishable update pushed to main advances the three-number product counter exactly once. PATCH is 0..100 inclusive; after 100 increment MINOR and reset PATCH to 0. MINOR is 0..10 inclusive; after 0.10.100 advance to 1.0.0. Apply the same carries after 1.x.
- Use plain numeric versions and tags, with no new rc suffix. Preserve historical tags. The migration baseline 0.4.0rc6 advances to 0.4.1; do not downgrade to 0.1.x.
- pyproject.toml is the sole authority. Run `uv run python scripts/release-version.py bump` once per publication batch; it synchronizes frontend metadata, installer defaults and uv.lock. Fix-up commits in a candidate batch retain that batch's version.
- Before updating main, check exactly one increment against its current full commit SHA with `uv run python scripts/release-version.py check --base SHA`. Feature-specific CI and version CI must pass, then publish the matching vMAJOR.MINOR.PATCH tag and installer release.
- Prefer the existing Release installers workflow with its exact numeric tag input on reviewed main. The workflow creates its matching tag with GITHUB_TOKEN after packaging checks; this avoids recursively triggering unrelated feature suites. Keep the single release pipeline and never replace a mismatched tag.
- Release packaging checks versions, immutable checksums and Windows entrypoints. Scientific and frontend feature tests belong to the affected feature CI, not an automatic global release suite. Protocol, data schema and example-bundle versions remain independent.

## Molecular display

- Default ligand previews use thin sticks with elemental colors and no large atom spheres, both standalone and with protein. Apply the shared appearance policy to overlays, native results, regions, selections and the integrated Mol* editor. Ketcher's native 3D editor uses Lines mode; its fixed-radius Licorice is too thick for the default.
- Selection or region highlights change color without inflating atoms. Explicit expert space-fill remains an intentional representation; isolated ions stay visible. Display styling must preserve source coordinates, atom identities and bond orders.

- Use the shared moderate ligand stick radius (0.14). Default to five nearby residue contacts with clear chain-colored backbone context and collapsed details; offer three/five/all viewing choices. Display residue-contact dashes by default for a real single complex or explicitly aligned receptor-plus-pose pair. Contact-count choices must not fade or recolor protein backbones. Pocket-region highlights add sticks while preserving continuous backbone cartoons. True comparisons never fabricate cross-model contacts. Geometric distances retain source coordinates and must not be mislabeled as hydrogen bonds or affinity.

- Show only the selected pose's exact native whole-pose docking score with method/units. Current previews have no per-residue energy decomposition; never substitute distance, contact counts, model confidence or an invented strong/weak scale for interaction force.
