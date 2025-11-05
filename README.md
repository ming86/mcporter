# mcp-runtime

TypeScript runtime and CLI for working with [Model Context Protocol](https://modelcontextprotocol.io) servers defined in `mcp_servers.json` files. `mcp-runtime` replaces the Python-based `pnpm mcp:*` helpers by:

- loading servers from JSON (including header/env interpolation)  
- exposing a composable runtime API for Bun/Node agents  
- shipping a drop-in CLI for one-off `list` / `call` workflows

## Installation

```bash
pnpm add mcp-runtime
# or
npm install mcp-runtime
```

## Usage

### Programmatic API

```ts
import { createRuntime } from "mcp-runtime";

const runtime = await createRuntime({
  configPath: "/path/to/config/mcp_servers.json",
});

const tools = await runtime.listTools("chrome-devtools");
const screenshot = await runtime.callTool("chrome-devtools", "take_screenshot", {
  url: "https://x.com",
});

await runtime.close();
```

`createRuntime` accepts either a `configPath` or a pre-parsed list of server definitions. Connections are pooled per server and reused for subsequent calls.

### Single-call helper

```ts
import { callOnce } from "mcp-runtime";

const result = await callOnce({
  server: "firecrawl",
  toolName: "crawl",
  args: { url: "https://anthropic.com" },
  configPath: "/path/to/mcp_servers.json",
});
```

### CLI

```
npx mcp-runtime list                    # show all configured servers
npx mcp-runtime list vercel --schema    # list tools + schemas for vercel server
npx mcp-runtime call linear.searchIssues --args '{"query":"status:InProgress"}'
```

Pass `--config <path>` or set `MCP_RUNTIME_CONFIG` to override the config location (defaults to `./config/mcp_servers.json`).

## Roadmap

- OAuth helper parity with the Python wrapper (token caching + browser dance)
- Streaming log helpers (tailing tool output)
- Type-safe code generation for frequently used tool schemas

See [`docs/spec.md`](docs/spec.md) for the high-level implementation plan and open questions.
