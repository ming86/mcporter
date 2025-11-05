---
summary: 'Plan for the mcp-runtime package replacing the Sweetistics pnpm MCP helpers.'
---

# mcp-runtime Roadmap

## Goals
- Provide a TypeScript runtime + CLI that exposes all MCP servers defined in `~/Projects/sweetistics/config/mcp_servers.json`.
- Preserve current one-shot `pnpm mcp:call` ergonomics while enabling reusable connections for Bun/Node agents.
- Keep feature parity with the Python helper (env interpolation, stdio wrapping, OAuth caching) and extend test coverage.

## Deliverables
- `packages/mcp-runtime` (standalone npm package) exporting:
  - `createRuntime()` for shared connections (list/call tools, resolve resources).
  - `callOnce()` convenience matching today’s single-call flow.
  - Typed utilities for env/header resolution and stdio command execution.
- CLI entry point (`npx mcp-runtime list|call`) built on the same runtime.
- Test harness using the Sweetistics MCP fixtures to validate every configured server definition.
- Documentation: README, usage examples, migration guide for replacing `pnpm mcp:*`.

## Architecture Notes
- Load MCP definitions from JSON (support relative paths + HTTPS).
- Reuse `@modelcontextprotocol/sdk` transports; wrap stdio via `scripts/mcp_stdio_wrapper.sh`.
- Mirror Python helper behavior:
  - `${VAR}`, `${VAR:-default}`, `$env:VAR` interpolation.
  - Optional OAuth token cache directory handling.
  - Tool signature + schema fetching for `list`.
- Provide lazy connection pooling per server to minimize startup cost.

## Work Phases
1. **Scaffold Package**
   - Init pnpm workspace config, tsconfig, lint/test scaffolding, build script.
2. **Core Runtime**
   - Port config parsing + env/header logic.
   - Implement connection cache, tool invocation, resource helpers.
3. **CLI Surface**
   - Implement `list` (with optional schema) and `call` commands.
   - Ensure output parity with existing helper.
4. **Testing & Fixtures**
   - Mock representative MCP servers (stdio + HTTP + OAuth) for integration tests.
   - Snapshot output for `list` vs. `call`.
5. **Docs & Migration**
   - Write README + migration doc.
   - Update Sweetistics docs to point to the new package.

## Open Questions
- How aggressively should we parallelize list calls? Current helper serializes to avoid load.
- Should we bundle a minimal REPL for ad-hoc debugging, or keep CLI focused on list/call?
- Do we expose streaming/async iterator interfaces for tools returning logs?
