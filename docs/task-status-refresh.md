# Task status refresh and failure recovery

The workbench reads task-list metadata, service health, selected-task metadata,
and selected-task artifacts independently. Task-list reads keep their existing
3-second cadence; health reads use a 10-second cadence consistent with the server
readiness cache; selected-task reads keep their existing 2-second cadence.
Each stream schedules its next read only after its current read succeeds.
Artifact or health failures cannot delay publication of successful task metadata.

## Bounded reads and recovery

- Each workbench read has a 30-second deadline composed with its effect's
  cancellation signal. The deadline also bounds a body reader or transport that
  does not reject its promise when cancelled.
- Selection changes cancel both selected-task streams. Refresh cancels and
  restarts all four streams. Unmount clears their timers. Late cancelled replies
  never publish into the new selection.
- A failed stream pauses until an explicit Retry/Reconnect. This matches task
  history's existing explicit recovery behavior and avoids repeatedly hammering
  an unavailable endpoint. Other healthy streams continue polling.
- Retry starts new reads; it is not evidence of recovery. The error and last
  confirmed metadata/files remain visible until the corresponding read succeeds.
  Repeated Retry cancels the previous generation rather than adding poll loops.
- Health has a separate availability warning and Retry across workbench views;
  the deployment view retains its existing reconnect UI. Unavailable health is
  cleared from readiness data. Task-status and task-file errors have distinct,
  bilingual, actionable warnings while a selected task is visible.
- A list-only outage shows a stale-data warning and Retry on Tasks, catalogue,
  research, settings and help views, whose shared task search/notifications still
  use the cached list. Classified task history has its own independent read and
  shows Reconnect only when that read fails; the generic Refresh tasks action also
  refreshes the list. Home/deployment keep their existing reconnect notice instead
  of showing a duplicate list warning.
- Before selected metadata exists, Tasks renders the identity-scoped loading/error
  state rather than silently returning to the module overview. An HTTP 404 means
  the task is unavailable in this workspace; network, timeout and other read
  failures offer a read-only Retry. Retry remains busy and keeps the error visible
  until metadata succeeds. It never calls task submission or task retry mutations.
- The selection and URL remain intact during missing/loading/error states. A
  normal hash link returns to task history with its module/type/status/query/page
  and project filters. Browser Back/Forward restores the selection through the
  existing hash/popstate authority. Cached loaded jobs retain the existing
  last-confirmed-state warnings; unavailable metadata does not fabricate a task.

The shared API request helper is unchanged. Upload deadlines, explicit POST
budgets, mutations, task submission and backend execution are unaffected.
No automatic mutation retry or scientific calculation is introduced.

## Reconciling list, detail and confirmed action snapshots

The API does not expose a task update revision. The workbench records a monotonic
request-start sequence and reconciles only snapshots with the same exact task ID.
Task lifecycle phase never goes backwards: queued, running, cancelling, terminal.
In particular, an active list snapshot cannot replace a confirmed terminal detail,
and an old detail snapshot cannot replace a fresher terminal list observation.
Equal-phase snapshots use valid completion timestamps when both are present,
then request-start sequence, never response arrival order. Only states returned
by the server are displayed. Retrying a task creates a different task ID and
therefore begins a separate lifecycle.

Confirmed task-action responses enter the same reconciliation path. The cache
retains only IDs in the current list plus the selected task, rather than growing
with every visited task. No scientific output or task identity is fabricated.

## Scoped verification

The automatic `Live task status fault checks` workflow runs focused hook,
request-deadline, application, task-detail, task-history, home and prediction
consumer tests, and sixteen Chromium cases:

- Health outage and stale list/detail responses after a confirmed failure
- Stalled artifacts reaching the actual application deadline while status updates
- Disconnection showing last-confirmed state, followed by successful explicit Retry
- Jobs-only failure on Tasks warns about stale summaries while selected status and
  classified history stay live; Retry refreshes the shared task notifications
- Selecting another task cancels old metadata and artifact requests
- Missing unlisted task links, reload, contextual history return and actual Back/Forward
- Unlisted task transport failure, busy read-only Retry and successful metadata recovery
- Leaving an unlisted pending task and selecting a different task

Each browser case runs in English desktop and Chinese mobile layouts over
controlled read-only API fixtures. The browser clock advances the application's
actual timers; production timeout constants are not patched. No backend worker,
model, scientific job or release archive is required by this new gate.
Screenshots, Playwright traces, request counts, cancellation events and page-error
records are retained as `task-status-fault-evidence`, including on failure.
The screenshot set includes the health outage, pending files, timed-out files,
disconnected last-confirmed status, stale task summaries, pending selection, and each final observed
state in both viewports. Each case's `acceptance.json` labels its screenshots with
language, viewport, actual visible task title/status, read warnings and controlled
fixture response status. These labels distinguish test fixtures from scientific
results and let reviewers inspect the failure UI before its Retry recovery.

Browser collection/static checks alone are not browser acceptance. Require the
workflow to pass for the exact reviewed commit, inspect its retained artifacts,
and validate the reviewed merge before closing the associated issue.
