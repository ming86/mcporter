import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { expandHome, resolveEnvPlaceholders } from "./env.js";

const RawServerSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	command: z.union([z.string(), z.array(z.string())]),
	headers: z.record(z.string()).optional(),
	env: z.record(z.string()).optional(),
	auth: z.string().optional(),
	token_cache_dir: z.string().optional(),
	client_name: z.string().optional(),
});

const RawConfigSchema = z.array(RawServerSchema);

export type RawServerDefinition = z.infer<typeof RawServerSchema>;

export interface HttpCommand {
	readonly kind: "http";
	readonly url: URL;
	readonly headers?: Record<string, string>;
}

export interface StdioCommand {
	readonly kind: "stdio";
	readonly command: string;
	readonly args: string[];
	readonly cwd: string;
}

export type CommandSpec = HttpCommand | StdioCommand;

export interface ServerDefinition {
	readonly name: string;
	readonly description?: string;
	readonly command: CommandSpec;
	readonly env?: Record<string, string>;
	readonly auth?: string;
	readonly tokenCacheDir?: string;
	readonly clientName?: string;
}

export interface LoadConfigOptions {
	readonly configPath?: string;
	readonly rootDir?: string;
}

export async function loadServerDefinitions(
	options: LoadConfigOptions = {},
): Promise<ServerDefinition[]> {
	const configPath = options.configPath
		? path.resolve(options.configPath)
		: path.resolve(process.cwd(), "config", "mcp_servers.json");

	const buffer = await fs.readFile(configPath, "utf8");
	const parsed = RawConfigSchema.parse(JSON.parse(buffer));
	const baseDir = options.rootDir ?? path.dirname(configPath);

	return parsed.map((entry) => normalizeServer(entry, baseDir));
}

function normalizeServer(
	entry: RawServerDefinition,
	baseDir: string,
): ServerDefinition {
	const command = normalizeCommand(entry.command, baseDir);
	const headers = entry.headers
		? Object.fromEntries(
				Object.entries(entry.headers).map(([name, value]) => [
					name,
					resolveEnvPlaceholders(value),
				]),
			)
		: undefined;

	const commandSpec =
		command.kind === "http"
			? { ...command, headers: { ...command.headers, ...headers } }
			: command;

	const tokenCacheDir =
		entry.auth === "oauth"
			? path.join(os.homedir(), ".mcp-runtime", entry.name)
			: entry.token_cache_dir
				? expandHome(entry.token_cache_dir)
				: undefined;

	return {
		name: entry.name,
		description: entry.description,
		command: commandSpec,
		env: entry.env,
		auth: entry.auth,
		tokenCacheDir,
		clientName: entry.client_name,
	};
}

function normalizeCommand(
	command: string | string[],
	baseDir: string,
): CommandSpec {
	if (typeof command === "string") {
		if (command.startsWith("http://") || command.startsWith("https://")) {
			return { kind: "http", url: new URL(command) };
		}
		throw new Error(
			`String commands must be HTTP(S) endpoints. Received '${command}'. Use an array for stdio commands.`,
		);
	}

	if (command.length === 0) {
		throw new Error("Stdio command must include at least one entry.");
	}

	const [first, ...rest] = command;
	if (!first) {
		throw new Error("Stdio command must include at least one entry.");
	}
	const exe = first;

	const resolvedArgs = rest.map((arg) => {
		if (arg.startsWith("~")) {
			return expandHome(arg);
		}
		return arg;
	});

	return {
		kind: "stdio",
		command: exe,
		args: resolvedArgs,
		cwd: baseDir,
	};
}

export function toFileUrl(filePath: string): URL {
	return pathToFileURL(filePath);
}
