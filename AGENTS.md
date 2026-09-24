# Cache Temperature development contract

This is a standalone installed DSH bundle, targeting DSH 0.1.7-rc.1 and Node 24.

## Scope and standards

- TypeScript for Host/shared code; React TSX for Client code; ESM source.
- Keep strict, noUncheckedIndexedAccess, and exactOptionalPropertyTypes enabled.
- skipLibCheck covers published third-party declarations only; it must not mask errors in this project's sources.
- No explicit any, @ts-ignore, or double assertions. Validate unknown values at external boundaries.
- Use DSH's public types, native Cordis registration/lifecycle, locale, Slots, and Settings.
- Do not patch the deployed DSH, shipped presets, Agent loop, or browser shell.
- Host owns requests and timers. Client owns configuration presentation only.
- Settings are independently keyed by session ID under cache-keepalive; do not replace other sessions' values.
- Request snapshots are immutable in-memory data, never persisted or printed in logs.
- Request the smallest output budget with maxTokens=1; the user explicitly permits the SDK's minimum (currently 16 for OpenAI Responses). Do not promise a universal one-token wire limit, arbitrarily enlarge the budget, or change thinking settings.

## Testing

Follow the loaded test-driven-development skill: observe RED for each behavior, implement minimally, verify GREEN, then refactor.
Use Vitest fake clocks and controlled adapters; do not spend real minutes in automated tests.
The skill's optional writing-good-tests.md resource is absent in this deployment; follow the complete loaded core instructions.
Do not catch module-import failures in settled tests or make an assertion pass by weakening the expected contract.
Run project-wide typecheck, lint, test, and build before release; report every failure and unverified check honestly.

## Team ownership

- Lead: root configuration, src/shared/**, tests/shared/**, documentation, packaging and installation.
- host-engineer: src/host/**, tests/host/**.
- client-engineer: src/client/**, tests/client/**.
- Integration reviewer: tests/integration/**; other scopes read-only.

Read, claim, and complete tasks using current revisions. Shared contract changes require Lead coordination.
Only Lead installs dependencies, changes build configuration, runs the release build, and installs the bundle.
Do not create scratch probes outside your assigned scope. Await running jobs instead of duplicating their work.
The session has approval prompts disabled: never set sandbox_permissions or justification on file/command operations.

## Behavioral invariants

Defaults: enabled=true, intervalMs=240000, idleTimeoutMs=1800000.
Idle deadline starts after normal turn completion, not after the last request; long-running tool phases have no idle cap.
Warm successes refresh scheduling but never extend the idle deadline.
Only successful real Agent requests may replace the replay snapshot.
Actual user cancellation stops the current keepalive episode; running status alone is not cancellation.
A foreground request preempts warm work without waiting for its completion.
Warm responses never create chat messages, dispatch tools, or drive a new Agent turn.
Each session has at most one warm request in flight, with a separate abort signal and a user-approved 90-second timeout. Idle expiration and user/foreground cancellation still preempt earlier.
Unloading or disposing must cancel work and fence off late results.
