# CLI ↔ Generator Code Reuse Plan

The goals below align `mcporter list`, the TypeScript CLI generator, and any future TS export modes so we build (and test) formatting logic once.

## 1. Shared Example Rendering

- **Problem**: `list-detail-helpers.ts` shortens `mcporter call` examples, but `generate/template.ts` still prints `--flag` examples via `buildExampleInvocation`.
- **Plan**:
  1. Export a non-colored `formatExampleBlock()` utility (and the internal `truncateExample()` helper) from `list-detail-helpers.ts`.
  2. Import that helper inside `renderToolCommand()` and replace `buildExampleInvocation` with the shared function-call output.
  3. Drop the duplicate `buildExampleInvocation/pickExampleValue` logic once Commander help uses the shared examples.
  4. Update the generator tests (in `tests/generate-cli.test.ts`) to expect the new syntax.

## 2. Optional Summary in Generated Help *(Completed)*

- **Problem**: The runtime CLI prints `// optional (n): …` while generated CLIs enumerate every flag.
- **What we did**:
  1. Reused `selectDisplayOptions()` so both CLI/GH generator decide which params to display.
  2. Added `formatOptionalSummary()` + `buildToolDoc()` wiring so each surface appends the same `// optional (…)` hint only when options were hidden.
  3. Updated `renderToolCommand()` to include the shared hint via `.addHelpText('afterAll', …)` and aligned tests.
- **Next**: No further action unless we change the minimum-visible threshold.

## 3. Consolidate Example Literal Selection *(Completed)*

- **Problem**: CLI used bespoke `buildExampleLiteral`/`buildFallbackLiteral` logic, while generator helpers guessed examples via `buildExampleValue`, so the call expressions could diverge.
- **What we did**:
  1. Moved the literal + fallback logic into `pickExampleLiteral()` / `buildFallbackLiteral()` exported from `src/cli/generate/tools.ts`.
  2. `buildToolDoc` now imports those helpers, so both `mcporter list` and generated CLIs share the same example arguments.
  3. Added unit tests in `tests/generate-cli-helpers.test.ts` covering enums, arrays, and ID/url fallbacks to keep behavior locked.
- **Next**: Consider reusing these helpers for any future docs/export modes that show sample invocations.

## 4. Usage String Builder Parity *(Completed)*

- **Problem**: Commander `.usage()` strings were hand-built (and always listed every flag) while `mcporter list` used the pseudo-TS formatter, so the two could diverge.
- **What we did**:
  1. Added `formatFlagUsage()` + `flagExtras` support inside `buildToolDoc`, so the same selector that powers TS signatures now emits the flag-based usage line.
  2. Updated `renderToolCommand()` to consume `doc.flagUsage` for both `.summary()` and `.usage()`; optional summaries stay unified through `buildToolDoc`.
  3. Added helper unit tests covering mixed required/optional flags and extra entries (e.g., `--raw <json>`).
- **Next**: Expose the shared usage string in `mcporter list` once we add a `--flags` view.

## 5. ToolDocModel Abstraction *(Completed)*

- **Problem**: The runtime CLI and generator still built flag labels + option descriptions separately, so changes to detail formatting required touching multiple files.
- **What we did**:
  1. Expanded `ToolDocModel` with `optionDocs` + `formatFlagLabel()`, so each tool’s flag label/description is computed once inside `buildToolDoc`.
  2. Updated `renderToolCommand()` to consume `doc.optionDocs` instead of reassembling strings, leaving only the parser wiring as generator-specific.
  3. Added assertions in `tests/list-detail-helpers.test.ts` for the new metadata, keeping the abstraction covered.
- **Next**: With the model centralised, future surfaces (e.g., `--emit-ts`) can render signatures/examples/options straight from `buildToolDoc`.

## 6. `emit-ts` Export Mode *(Completed)*

- **Goal**: Provide a typed contract (and optional client) for each MCP server so agents/tools no longer scrape CLI output.
- **What we did**:
  1. Added `mcporter emit-ts <server>` with `--mode types|client`, auto-overwriting targets and deriving `.d.ts` names for client mode.
  2. Reused `buildToolDoc` + new templates to emit interfaces (promisified signatures + doc comments) and executable wrappers that return `CallResult` objects.
  3. Added `tests/emit-ts.test.ts` to snapshot the templates and run the command end-to-end with a stub runtime; documented the workflow in `docs/emit-ts.md`.
- **Next**: Consider supporting per-tool filters and shared schema maps inside the generated client for faster cold starts.

---

Sequencing recommendation:
1. Implement shared example helper (small change, immediate parity). **Done** – `list-detail-helpers.ts` now exports `formatExampleBlock`, `formatCallExpressionExample`, & the generator consumes them.
2. Extract `ToolDocModel` + optional summary builder. **Done** – `buildToolDoc` in `src/cli/list-detail-helpers.ts` now feeds both `handleList` and `renderToolCommand`.
3. Update generator to consume the shared helpers (examples + optional summary + signatures). **In progress** – signatures/examples unified; `ToolDocModel` still pending.
4. Add unit tests for the new helper module.
5. Build the `--emit-ts` mode once reuse is in place.
