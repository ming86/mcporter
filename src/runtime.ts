import fs from "node:fs/promises";
import path from "node:path";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
	CallToolRequest,
	ListResourcesRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { loadServerDefinitions, type ServerDefinition } from "./config.js";
import { withEnvOverrides } from "./env.js";

const PACKAGE_NAME = "mcp-runtime";
const CLIENT_VERSION = "0.0.1";

export interface RuntimeOptions {
	readonly configPath?: string;
	readonly servers?: ServerDefinition[];
	readonly rootDir?: string;
	readonly clientInfo?: {
		name: string;
		version: string;
	};
	readonly logger?: RuntimeLogger;
}

export interface RuntimeLogger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string, error?: unknown): void;
}

export interface CallOptions {
	readonly args?: CallToolRequest["params"]["arguments"];
}

export interface ListToolsOptions {
	readonly includeSchema?: boolean;
}

export interface Runtime {
	listServers(): string[];
	getDefinitions(): ServerDefinition[];
	getDefinition(server: string): ServerDefinition;
	listTools(
		server: string,
		options?: ListToolsOptions,
	): Promise<ServerToolInfo[]>;
	callTool(
		server: string,
		toolName: string,
		options?: CallOptions,
	): Promise<unknown>;
	listResources(
		server: string,
		options?: Partial<ListResourcesRequest["params"]>,
	): Promise<unknown>;
	connect(server: string): Promise<ClientContext>;
	close(server?: string): Promise<void>;
}

export interface ServerToolInfo {
	readonly name: string;
	readonly description?: string;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
}

interface ClientContext {
	readonly client: Client;
	readonly transport: Transport & { close(): Promise<void> };
	readonly definition: ServerDefinition;
}

export async function createRuntime(
	options: RuntimeOptions = {},
): Promise<Runtime> {
	const servers =
		options.servers ??
		(await loadServerDefinitions({
			configPath: options.configPath,
			rootDir: options.rootDir,
		}));

	const runtime = new McpRuntime(servers, options);
	return runtime;
}

export async function callOnce(params: {
	server: string;
	toolName: string;
	args?: Record<string, unknown>;
	configPath?: string;
}): Promise<unknown> {
	const runtime = await createRuntime({ configPath: params.configPath });
	try {
		return await runtime.callTool(params.server, params.toolName, {
			args: params.args,
		});
	} finally {
		await runtime.close(params.server);
	}
}

class McpRuntime implements Runtime {
	private readonly definitions: Map<string, ServerDefinition>;
	private readonly clients = new Map<string, Promise<ClientContext>>();
	private readonly logger: RuntimeLogger;
	private readonly clientInfo: { name: string; version: string };

	constructor(servers: ServerDefinition[], options: RuntimeOptions = {}) {
		this.definitions = new Map(servers.map((entry) => [entry.name, entry]));
		this.logger = options.logger ?? createConsoleLogger();
		this.clientInfo = options.clientInfo ?? {
			name: PACKAGE_NAME,
			version: CLIENT_VERSION,
		};
	}

	listServers(): string[] {
		return [...this.definitions.keys()].sort((a, b) => a.localeCompare(b));
	}

	getDefinitions(): ServerDefinition[] {
		return [...this.definitions.values()];
	}

	getDefinition(server: string): ServerDefinition {
		const definition = this.definitions.get(server);
		if (!definition) {
			throw new Error(`Unknown MCP server '${server}'.`);
		}
		return definition;
	}

	async listTools(
		server: string,
		options: ListToolsOptions = {},
	): Promise<ServerToolInfo[]> {
		const { client } = await this.connect(server);
		const response = await client.listTools({ server: {} });
		return (response.tools ?? []).map((tool) => ({
			name: tool.name,
			description: tool.description ?? undefined,
			inputSchema: options.includeSchema ? tool.inputSchema : undefined,
			outputSchema: options.includeSchema ? tool.outputSchema : undefined,
		}));
	}

	async callTool(
		server: string,
		toolName: string,
		options: CallOptions = {},
	): Promise<unknown> {
		const { client } = await this.connect(server);
		const params: CallToolRequest["params"] = {
			name: toolName,
			arguments: options.args ?? {},
		};
		return client.callTool(params);
	}

	async listResources(
		server: string,
		options: Partial<ListResourcesRequest["params"]> = {},
	): Promise<unknown> {
		const { client } = await this.connect(server);
		return client.listResources(options as ListResourcesRequest["params"]);
	}

	async connect(server: string): Promise<ClientContext> {
		const normalized = server.trim();
		const existing = this.clients.get(normalized);
		if (existing) {
			return existing;
		}

		const definition = this.definitions.get(normalized);
		if (!definition) {
			throw new Error(`Unknown MCP server '${normalized}'.`);
		}

		const connection = this.createClient(definition);
		this.clients.set(normalized, connection);
		try {
			return await connection;
		} catch (error) {
			this.clients.delete(normalized);
			throw error;
		}
	}

	async close(server?: string): Promise<void> {
		if (server) {
			const normalized = server.trim();
			const context = await this.clients.get(normalized);
			if (!context) {
				return;
			}
			await context.transport.close().catch(() => {});
			this.clients.delete(normalized);
			return;
		}

		for (const [name, promise] of this.clients.entries()) {
			try {
				const context = await promise;
				await context.transport.close().catch(() => {});
			} finally {
				this.clients.delete(name);
			}
		}
	}

	private async createClient(
		definition: ServerDefinition,
	): Promise<ClientContext> {
		const client = new Client(this.clientInfo);

		return withEnvOverrides(definition.env, async () => {
			if (definition.command.kind === "stdio") {
				const transport = new StdioClientTransport({
					command: definition.command.command,
					args: definition.command.args,
					cwd: definition.command.cwd,
				});
				await client.connect(transport);
				return { client, transport, definition };
			}

			const requestInit: RequestInit = definition.command.headers
				? { headers: definition.command.headers as HeadersInit }
				: {};

			const streamableTransport = new StreamableHTTPClientTransport(
				definition.command.url,
				{
					requestInit,
				},
			);

			try {
				await client.connect(streamableTransport);
				return { client, transport: streamableTransport, definition };
			} catch (error) {
				await streamableTransport.close().catch(() => {});
				if (error instanceof UnauthorizedError) {
					this.logger.warn(
						`Authentication required for '${definition.name}'. OAuth flows are not yet implemented in mcp-runtime.`,
					);
					throw error;
				}
				this.logger.info(
					`Falling back to SSE transport for '${definition.name}': ${(error as Error).message}`,
				);
				const sseTransport = new SSEClientTransport(definition.command.url, {
					requestInit,
				});
				await client.connect(sseTransport);
				return { client, transport: sseTransport, definition };
			}
		});
	}
}

function createConsoleLogger(): RuntimeLogger {
	return {
		info: (message) => {
			console.log(`[mcp-runtime] ${message}`);
		},
		warn: (message) => {
			console.warn(`[mcp-runtime] ${message}`);
		},
		error: (message, error) => {
			console.error(`[mcp-runtime] ${message}`);
			if (error) {
				console.error(error);
			}
		},
	};
}

export async function readJsonFile<T = unknown>(
	filePath: string,
): Promise<T | undefined> {
	try {
		const content = await fs.readFile(filePath, "utf8");
		return JSON.parse(content) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

export async function writeJsonFile(
	filePath: string,
	data: unknown,
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
