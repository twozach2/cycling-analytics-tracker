# Product Roadmap: Route-First Supportive Cycling Coach


## Current implementation status

- Phase 0 complete in `46a3cb9`.
- Phase 1 complete in `a861224`.
- Phase 2 complete in `9296337`; the real-sidecar matrix passed on Windows, macOS, and Linux in [Actions run 31913288748](https://github.com/twozach2/cycling-analytics-tracker/actions/runs/31913288748).
- Phase 3 complete locally: shared ride intentions, indoor/outdoor choices, persisted daily selections, optional `.ZWO`/GPX exports, a packaged loopback BRouter runtime, explicit regional-map consent/removal, and live three-loop controls are implemented.
- Cross-cutting progress view implemented: full-history ride graphs, shared filters, zero-based axes, missing-signal coverage, and mixed-context interpretation guardrails.
Branch: `codex/coaching-product`

## Product thesis

Build a privacy-first cycling coach that helps recreational riders keep riding and improve without turning training into a pass/fail program.

The core loop is:

1. Explain today's readiness and relevant recent evidence.
2. Let the rider choose a time commitment.
3. Offer several route choices with a flexible ride intention for each.
4. Import the completed ride automatically.
5. Reflect on what happened with evidence and encouragement.
6. Adapt future suggestions without penalizing missed or modified rides.

Structured workouts and device delivery are optional extensions. The rider keeps agency.

## Product principles

- Suggestions, not commands.
- Evidence and confidence are visible.
- Observations are not diagnoses.
- A changed or skipped ride is information, not failure.
- Deterministic local analytics remain separate from generative AI.
- Strava-derived data is never sent to an LLM.
- The product remains useful with direct FIT/TCX/GPX imports.

## Phase 0 — Foundation

- Extract shared math and local-date utilities.
- Split the dashboard into view modules without changing behavior.
- Add a typed API helper with network, HTTP, and payload error discrimination.
- Separate import-save failures from post-save refresh failures.
- Add local-server security headers.
- Make automatic Strava sync claiming atomic.
- Exit with lint, build, and all tests green.

## Phase 1 — Consolidated evidence model

- Add conventional 42-day fitness-load and 7-day fatigue-load series with an insufficient-data state.
- Extend the existing power-duration record history into all-time, 90-day, and 42-day curves.
- Use one load definition in the dashboard and coach.
- Label modeled fitness/fatigue as training-load estimates, not physiological measurements.

## Phase 2 — Route-engine feasibility spike

- Prove BRouter can run locally on Windows, macOS, and Linux.
- Download one regional OSM/elevation segment on demand.
- Generate three round-trip cycling candidates from a starting point.
- Measure package size, startup time, route latency, and failure behavior.
- Make the routing dependency decision before building route UI.

## Phase 3 — Route plus ride intention

- Model a flexible ride intention: mode, duration range, power/HR cues, optional focus blocks, and encouragement.
- Pair each intention with several indoor or outdoor route choices.
- Keep optional structured intervals as an export format rather than the default experience.
- Provide `.ZWO` and GPX downloads where appropriate.
- Persist the rider's selected route, intention, evidence, and threshold snapshot for later reflection.

## Phase 4 — Supportive reflection and adaptation

- Compare completed work with the chosen intention descriptively.
- Explain what matched, what varied, and what the evidence suggests next.
- Never issue a compliance grade.
- Adapt the following seven days for readiness, completed load, rider feedback, and changed plans.
- Persist an auditable "what changed and why" feed.

## Phase 5 — Delivery and product onboarding

- Apply for the Garmin Connect Developer Program early enough to avoid blocking delivery work.
- Add Garmin Training and Courses integration after the core loop is validated.
- Replace bring-your-own-Strava-key onboarding before any public beta.
- Add reliable backup/restore, update delivery, diagnostics export, and privacy controls.

## Product MVP

The product MVP is complete when a new rider can:

1. Connect or import ride history.
2. Understand today's recommendation and its confidence.
3. Choose among three routes at different time commitments.
4. Receive a flexible goal for the selected route.
5. Sync the completed ride without duplication.
6. See an encouraging evidence-backed reflection.
7. Receive an updated suggestion that accounts for today's ride.

## Deferred until the core loop is validated

- Generative Coach Mode.
- Multi-athlete coach dashboards.
- Strict workout compliance scoring.
- Full season-plan automation.
- Social features.
- A hosted analytics backend.

## External constraints

- Treat Strava API data as unavailable to generative AI or ML processing unless policy and authorization explicitly change.
- Avoid dependency on Segment Explore; use OSM-based routing and rider-owned imported GPS files.
- Garmin Connect APIs require program approval and should not be a prerequisite for the core experience.
- BRouter and MapLibre require explicit packaging, licensing, offline-data, and update plans before adoption.
