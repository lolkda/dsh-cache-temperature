import Schema from "@deepseek-ai/schemastery";
import { isAgentLoopRequest } from "@deepseek-ai/dsh-llm";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

//#region tests/live-probe/index.ts
const name = "cache-temperature-live-check";
const inject = [
	"llm",
	"settings",
	"agents"
];
const Config = Schema.object({
	targetSessionId: Schema.string().required(),
	outputPath: Schema.string().required()
});
const namespace = "cache-keepalive";
const testIntervalMs = 15e3;
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function row(document, id) {
	if (!record(document) || !record(document.sessions)) return {
		exists: false,
		value: void 0
	};
	return {
		exists: Object.hasOwn(document.sessions, id),
		value: document.sessions[id]
	};
}
/** Hash only; never persist the actual conversation or replay metadata. */
function fingerprint(options) {
	try {
		const { signal: _signal, maxTokens: _budget,...input } = options;
		return createHash("sha256").update(JSON.stringify(input)).digest("hex");
	} catch {
		return null;
	}
}
/** One temporary observer; no tools, prompts, UI, or Agent driving. */
function apply(ctx, config) {
	const agent = ctx.agents.list().find((item) => String(item.id) === config.targetSessionId);
	if (agent === void 0) throw new Error("The specified live session is unavailable");
	const workspace = agent.session.header.cwd;
	const output = resolve(config.outputPath);
	if (workspace === void 0 || !output.startsWith(`${resolve(workspace)}${sep}`)) throw new Error("Live probe output must remain inside the session workspace");
	const logger = ctx.logger("cache-temperature-live-check");
	const startedAt = Date.now();
	let previous = {
		exists: false,
		value: void 0
	};
	let configured = false;
	let configuring;
	let finished = false;
	let finishing;
	let latestRealHash = null;
	let realRequestsObserved = 0;
	let warmActive = false;
	const forbiddenEvents = [];
	let request = null;
	let terminal = null;
	let failureCode = null;
	let usage = null;
	const describe = () => {
		const descriptor = ctx.settings.describe({ redactSecrets: true }).find((item) => String(item.ns) === namespace);
		if (descriptor === void 0) throw new Error("Keepalive settings are not registered");
		return descriptor;
	};
	async function restore() {
		if (!configured) return "untouched";
		const current = describe();
		const currentRow = row(current.user, config.targetSessionId).value;
		if (!record(currentRow) || currentRow.enabled !== true || currentRow.intervalMs !== testIntervalMs || currentRow.idleTimeoutMs !== 18e5) return "kept-newer-values";
		const path = ["sessions", config.targetSessionId];
		await ctx.settings.mutate(namespace, previous.exists ? [{
			op: "set",
			path,
			value: previous.value
		}] : [{
			op: "unset",
			path
		}], current.revision);
		return "restored";
	}
	function finish(reason) {
		if (finishing !== void 0) return finishing;
		finished = true;
		clearTimeout(timeout);
		finishing = (async () => {
			await configuring?.catch(() => void 0);
			let restoration = "failed";
			try {
				restoration = await restore();
			} catch (error) {
				logger.error("restore failed: %s", error instanceof Error ? error.name : "unknown");
			}
			const normalFinish = terminal !== null && [
				"stop",
				"tool-calls",
				"max-tokens"
			].includes(terminal);
			const result = {
				reason,
				startedAt,
				finishedAt: Date.now(),
				sessionId: config.targetSessionId,
				realRequestsObserved,
				request,
				terminal,
				failureCode,
				usage,
				forbiddenEvents,
				restoration,
				passed: reason === "observed" && normalFinish && request?.maxTokens === 1 && request.sameInput && forbiddenEvents.length === 0 && restoration === "restored" && (usage === null || usage.outputTokens <= 1)
			};
			await mkdir(dirname(output), { recursive: true });
			await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			logger.info("verification completed reason=%s restored=%s passed=%s", reason, restoration, result.passed);
		})();
		return finishing;
	}
	async function configure() {
		const current = describe();
		previous = row(current.user, config.targetSessionId);
		await ctx.settings.mutate(namespace, [
			{
				op: "set",
				path: [
					"sessions",
					config.targetSessionId,
					"enabled"
				],
				value: true
			},
			{
				op: "set",
				path: [
					"sessions",
					config.targetSessionId,
					"intervalMs"
				],
				value: testIntervalMs
			},
			{
				op: "set",
				path: [
					"sessions",
					config.targetSessionId,
					"idleTimeoutMs"
				],
				value: 18e5
			}
		], current.revision);
		configured = true;
		logger.info("verification armed session=%s intervalMs=%d", config.targetSessionId, testIntervalMs);
	}
	const timeout = setTimeout(() => {
		finish("timeout").catch((error) => logger.error("report failed: %s", error instanceof Error ? error.name : "unknown"));
	}, 18e4);
	ctx.effect(() => () => finish("disposed"));
	ctx.on("session/event", (session, event) => {
		if (warmActive && String(session.id) === config.targetSessionId && [
			"user/message",
			"assistant/message",
			"assistant/attempt",
			"tool/call",
			"tool/result",
			"turn/start"
		].includes(event.type)) forbiddenEvents.push(event.type);
	});
	ctx.on("llm/stream", (options, next) => {
		if (finished || options.sessionId !== agent.id) return next();
		const real = isAgentLoopRequest(options);
		const warm = configured && !real && options.maxTokens === 1 && options.purpose === void 0;
		if (!real && !warm) return next();
		return (async function* () {
			const hash = fingerprint(options);
			let realSucceeded = false;
			if (warm) {
				warmActive = true;
				request = {
					provider: options.provider,
					model: options.model,
					maxTokens: options.maxTokens,
					sameInput: latestRealHash !== null && hash === latestRealHash,
					messages: options.messages.length
				};
			}
			try {
				for await (const chunk of next()) {
					if (chunk.type === "finish") {
						if (real) realSucceeded = chunk.reason.kind !== "error" && chunk.reason.kind !== "aborted";
						if (warm) {
							terminal = chunk.reason.kind;
							if (chunk.reason.kind === "error" || chunk.reason.kind === "aborted") failureCode = chunk.reason.failure.code;
						}
					}
					if (warm && chunk.type === "usage") usage = chunk.usage;
					yield chunk;
				}
			} finally {
				if (real && realSucceeded && !finished) {
					latestRealHash = hash;
					realRequestsObserved += 1;
					configuring ??= configure().catch((error) => {
						failureCode = error instanceof Error ? error.name : "configuration-error";
						queueMicrotask(() => {
							finish("configuration-error").catch(() => void 0);
						});
					});
				}
				if (warm) {
					warmActive = false;
					finish("observed").catch((error) => logger.error("report failed: %s", error instanceof Error ? error.name : "unknown"));
				}
			}
		})();
	});
}

//#endregion
export { Config, apply, inject, name };