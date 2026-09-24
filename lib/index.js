import Schema from "@deepseek-ai/schemastery";
import { isAgentLoopRequest } from "@deepseek-ai/dsh-llm";

//#region src/shared/settings.ts
const KEEPALIVE_REQUEST_TIMEOUT_MS = 9e4;
const MIN_DURATION_MS = 1e3;
const MAX_DURATION_MS = 2147483647;
const DEFAULT_SESSION_SETTINGS = Object.freeze({
	enabled: true,
	intervalMs: 24e4,
	idleTimeoutMs: 18e5
});
const durationSchema = Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1);
/**
* One session's stored preference, with the schema supplying omitted fields.
*
* Every node in this subtree has to stay serializable. The Host projects the
* plugin's `Config` into the envelope a browser settings form rehydrates with
* `new Schema(envelope)` and then validates the served section against; a node
* whose behavior lives in a JavaScript callback (`Schema.transform`) does not
* survive that round trip, so the rehydrated copy would reject every stored
* section and the form would stay at `loading` forever. Strict field checking
* therefore rides the document's Standard Schema face instead — see
* {@link settingsSchema}.
*/
const sessionSettingsSchema = Schema.object({
	enabled: Schema.boolean().default(DEFAULT_SESSION_SETTINGS.enabled),
	intervalMs: Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1).default(DEFAULT_SESSION_SETTINGS.intervalMs),
	idleTimeoutMs: Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1).default(DEFAULT_SESSION_SETTINGS.idleTimeoutMs)
});
/** Loader-owned live configuration; persisted session values remain plain JSON. */
const documentSchema = Schema.object({ sessions: Schema.dict(sessionSettingsSchema).default({}).volatile() });
/**
* The Loader-resolved configuration schema.
*
* The Loader validates a plugin's `Config` through its Standard Schema face
* (`runtime.Config['~standard'].validate`), while the settings forms project the
* same object through `toJSON()` for the browser. Composing both faces here
* keeps the strict document check off the serialized envelope: the projected
* subtree stays plain, so a browser form decodes every served section, and a
* write carrying an unknown or invalid field is still refused before it can
* reach the profile patch.
*/
const settingsSchema = withStrictDocument(documentSchema, decodeSettingsDocument);
/**
* Add a strict document check to one schema's Standard Schema face.
*
* The supplied check runs only after the schema itself resolved the input, so
* the resolved output — including the volatile session reference the Host
* reads — stays the schema's own.
*
* @param schema - the document schema the Loader and the forms share.
* @param checkDocument - rejects an input document this plugin cannot store.
* @returns the same schema instance, with the strict face installed.
*/
function withStrictDocument(schema, checkDocument) {
	const standard = schema["~standard"];
	Object.defineProperty(schema, "~standard", {
		configurable: true,
		value: {
			version: standard.version,
			vendor: standard.vendor,
			validate(value) {
				const result = standard.validate(value);
				if (!("then" in result) && result.issues === void 0) checkDocument(value === void 0 ? {} : value);
				return result;
			}
		}
	});
	return schema;
}
function isPlainRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
function validateDuration(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) throw new TypeError("Duration must be a finite integer number of milliseconds");
	return durationSchema(value);
}
/** Validate one persisted session preference without accepting unknown fields. */
function decodeSessionSettings(input) {
	if (!isPlainRecord(input) || Object.keys(input).some((key) => ![
		"enabled",
		"intervalMs",
		"idleTimeoutMs"
	].includes(key))) throw new TypeError("Invalid session keepalive settings");
	const enabled = input.enabled === void 0 ? DEFAULT_SESSION_SETTINGS.enabled : input.enabled;
	if (typeof enabled !== "boolean") throw new TypeError("Enabled must be a boolean");
	return {
		enabled,
		intervalMs: input.intervalMs === void 0 ? DEFAULT_SESSION_SETTINGS.intervalMs : validateDuration(input.intervalMs),
		idleTimeoutMs: input.idleTimeoutMs === void 0 ? DEFAULT_SESSION_SETTINGS.idleTimeoutMs : validateDuration(input.idleTimeoutMs)
	};
}
/** Validate the persistence boundary without coercion, then resolve defaults. */
function decodeSettingsDocument(value) {
	if (!isPlainRecord(value) || Object.keys(value).some((key) => key !== "sessions")) throw new TypeError("Expected a keepalive settings document");
	const sessions = value.sessions === void 0 ? {} : value.sessions;
	if (!isPlainRecord(sessions)) throw new TypeError("Expected a session settings dictionary");
	const entries = [];
	for (const [id, input] of Object.entries(sessions)) entries.push([id, decodeSessionSettings(input)]);
	return { sessions: Object.fromEntries(entries) };
}
/** Resolve only the selected session without creating persistent entries. */
function getSessionSettings(document, sessionId) {
	return Object.hasOwn(document.sessions, sessionId) ? document.sessions[sessionId] ?? DEFAULT_SESSION_SETTINGS : DEFAULT_SESSION_SETTINGS;
}

//#endregion
//#region src/host/policy.ts
/**
* Decide whether this session may start one warm request now.
*
* Warm work is admitted during a long tool wait of a live round — that phase
* has no idle cap — and inside the idle window opened by a normally completed
* turn while the agent is not running, so a new turn cannot keep warming
* between its start and its first model call. A foreground model request or an
* already in-flight warm request always preempts, and an abnormally ended round
* opens no idle window at all.
*
* @param input - per-session admission state.
* @param now - current epoch milliseconds.
* @returns whether a warm request may start.
*/
function mayStartWarmRequest(input, now) {
	if (!input.enabled || !input.hasSnapshot) return false;
	if (input.foregroundRequests > 0 || input.warmInFlight) return false;
	if (input.running && input.toolCount > 0) return true;
	if (input.running) return false;
	return input.idleDeadline !== void 0 && now < input.idleDeadline;
}
/**
* Build the keepalive replay of one captured request: the whole request, with
* only the output budget pinned to the smallest value and a caller-owned signal.
*
* The replay always asks for a single output token. A provider SDK may raise
* that to its own minimum — OpenAI Responses currently clamps it to 16 — so no
* universal one-token wire limit is promised; this function never enlarges the
* budget itself, and never touches reasoning or thinking settings.
*
* @param snapshot - the last successful real agent-loop request.
* @param signal - the warm attempt's own abort signal.
* @returns a new request object; the snapshot is never mutated.
*/
function createWarmRequest(snapshot, signal) {
	return {
		...snapshot,
		maxTokens: 1,
		signal
	};
}
/**
* True lower bound before the next warm attempt, in milliseconds.
*
* A provider backoff is honoured only when it is a usable positive finite
* number; `NaN`, `Infinity`, and non-positive values are ignored so they can
* never become a timer delay. The bound itself is NOT capped: a provider that
* asks for longer than the platform's largest timer delay still gets its full
* wait, with the timer used only as an "ask again later" hint.
*
* @param intervalMs - the session's configured refresh interval.
* @param retryAfterMs - provider-declared backoff from a failed attempt.
* @returns the lower bound to wait before the next attempt.
*/
function retryBackoffMs(intervalMs, retryAfterMs) {
	const interval = Math.max(intervalMs, 1);
	if (retryAfterMs === void 0 || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return interval;
	return Math.max(interval, retryAfterMs);
}
/**
* Delay a timer may use for the next wake.
*
* Bounded to the largest timer delay: passing `NaN`, `Infinity`, or a value
* above the platform limit to a timer would collapse to a one-millisecond hot
* loop. The wait itself is owned by {@link retryBackoffMs}; a wake that fires
* early must re-check the lower bound instead of warming.
*
* @param intervalMs - the session's configured refresh interval.
* @param retryAfterMs - provider-declared backoff from a failed attempt.
* @returns the bounded delay to wait before the next attempt.
*/
function nextAttemptDelayMs(intervalMs, retryAfterMs) {
	const interval = Math.min(Math.max(intervalMs, 1), MAX_DURATION_MS);
	return Math.min(Math.max(interval, retryBackoffMs(intervalMs, retryAfterMs)), MAX_DURATION_MS);
}

//#endregion
//#region src/host/keepalive.ts
/**
* Per-session prompt-cache keepalive scheduling.
*
* The controller owns every timer and request the plugin issues. It never
* appends to a session log, never dispatches a tool, and never drives an agent
* turn: a warm cycle only replays the last successful real agent request with
* the smallest output budget it can ask for and its own abort signal. The
* provider SDK may raise that budget to its own minimum, which is accepted.
*/
var KeepaliveController = class {
	ctx;
	source;
	logger;
	sessions = /* @__PURE__ */ new Map();
	ownRequests = /* @__PURE__ */ new WeakSet();
	disposed = false;
	constructor(ctx, source) {
		this.ctx = ctx;
		this.source = source;
		this.logger = ctx.logger("cache-temperature");
	}
	/**
	* Observe one model call. Real agent-loop requests preempt warm work
	* immediately, and a normally completed one becomes the next replay source.
	*
	* @param options - the request offered to the `llm/stream` waterfall.
	* @param next - downstream chain producing the model chunk stream.
	* @returns the chunk stream, or the untouched downstream stream.
	*/
	handleStream(options, next) {
		if (this.disposed || !isAgentLoopRequest(options) || this.ownRequests.has(options)) return next();
		const sessionId = options.sessionId;
		if (sessionId === void 0) return next();
		const state = this.stateFor(String(sessionId));
		state.foregroundRequests += 1;
		state.version += 1;
		state.roundOpen = true;
		state.idleStartedAt = void 0;
		this.cancelWarm(state, "foreground");
		this.plan(state);
		const onAbort = () => {
			state.roundOpen = false;
			state.idleStartedAt = void 0;
			this.cancelWarm(state, "cancelled");
			this.plan(state);
		};
		options.signal?.addEventListener("abort", onAbort, { once: true });
		let stream;
		try {
			stream = next();
		} catch (error) {
			options.signal?.removeEventListener("abort", onAbort);
			state.foregroundRequests -= 1;
			throw error;
		}
		return this.observeRealRequest(state, options, stream, onAbort);
	}
	/**
	* Observe one tool dispatch so a long tool wait stays warmable, and so the
	* wait has no idle cap. The cancellation listener is removed with the
	* dispatch, so a later signal cleanup cannot read as a user stop.
	*
	* @param exec - the allowed call about to dispatch.
	* @param next - downstream dispatch chain.
	* @returns the dispatch result.
	*/
	async handleTool(exec, next) {
		const sessionId = exec.agent?.id;
		if (this.disposed || sessionId === void 0 || exec.parent !== void 0) return next();
		const state = this.stateFor(String(sessionId));
		state.toolCount += 1;
		const onAbort = () => {
			state.roundOpen = false;
			state.idleStartedAt = void 0;
			this.cancelWarm(state, "cancelled");
			this.plan(state);
		};
		exec.signal.addEventListener("abort", onAbort, { once: true });
		this.plan(state);
		try {
			return await next();
		} finally {
			exec.signal.removeEventListener("abort", onAbort);
			state.toolCount -= 1;
			this.plan(state);
		}
	}
	/**
	* Mirror an `agent/status` transition. Running status alone never cancels
	* warm work; it only closes the idle window to new warm requests.
	*
	* @param sessionId - the session whose agent changed status.
	* @param status - the status just entered.
	*/
	setStatus(sessionId, status) {
		if (this.disposed) return;
		const state = this.stateFor(sessionId);
		state.running = status === "running";
		this.plan(state);
	}
	/**
	* Close one turn. A normal completion opens the idle window; any other
	* reason ends the round until the next successful real request.
	*
	* @param sessionId - the session whose turn ended.
	* @param reason - the durable turn end reason.
	*/
	endTurn(sessionId, reason) {
		if (this.disposed) return;
		const state = this.stateFor(sessionId);
		if (reason.kind === "completed") {
			state.idleStartedAt = Date.now();
			this.plan(state);
			return;
		}
		state.roundOpen = false;
		state.idleStartedAt = void 0;
		this.cancelWarm(state, "round-ended");
		this.plan(state);
	}
	/** Re-evaluate every session after the settings document changed. */
	settingsChanged() {
		if (this.disposed) return;
		for (const state of this.sessions.values()) {
			const settings = this.settingsFor(state.sessionId);
			if (settings === void 0 || !settings.enabled) this.cancelWarm(state, "disabled");
			this.plan(state);
		}
	}
	/** Forget one session whose agent or session left the runtime. */
	dropSession(sessionId) {
		const state = this.sessions.get(sessionId);
		if (state === void 0) return;
		this.cancelWarm(state, "session-disposed");
		this.stopTimer(state);
		this.sessions.delete(sessionId);
	}
	/** Cancel every timer and in-flight warm request; late results are ignored. */
	dispose() {
		this.disposed = true;
		for (const state of this.sessions.values()) {
			this.cancelWarm(state, "disposed");
			this.stopTimer(state);
		}
		this.sessions.clear();
	}
	stateFor(sessionId) {
		const existing = this.sessions.get(sessionId);
		if (existing !== void 0) return existing;
		const created = {
			sessionId,
			snapshot: void 0,
			version: 0,
			roundOpen: false,
			running: false,
			toolCount: 0,
			foregroundRequests: 0,
			idleStartedAt: void 0,
			lastRefreshAt: void 0,
			nextAllowedAt: void 0,
			warm: void 0,
			timer: void 0,
			wakeAt: void 0
		};
		this.sessions.set(sessionId, created);
		return created;
	}
	/**
	* Read one session's settings. An unreadable document degrades the feature to
	* off for that session and is reported, but never breaks a real request.
	*/
	settingsFor(sessionId) {
		try {
			return getSessionSettings(this.source.get(), sessionId);
		} catch (error) {
			this.logger.error("keepalive settings unavailable session=%s error=%s", sessionId, error instanceof Error ? error.message : String(error));
			return;
		}
	}
	async *observeRealRequest(state, options, stream, onAbort) {
		let succeeded = false;
		try {
			for await (const chunk of stream) {
				if (chunk.type === "finish") succeeded = chunk.reason.kind !== "error" && chunk.reason.kind !== "aborted";
				yield chunk;
			}
		} finally {
			options.signal?.removeEventListener("abort", onAbort);
			state.foregroundRequests -= 1;
			if (succeeded && state.roundOpen && options.signal?.aborted !== true) {
				state.snapshot = options;
				state.version += 1;
				state.lastRefreshAt = Date.now();
				state.nextAllowedAt = void 0;
			}
			this.plan(state);
		}
	}
	/**
	* Recompute the next wake from the session's anchors: the refresh cadence
	* runs from the last settled request or warm attempt, the idle window from
	* its own start, and a tool wait has no idle cap at all.
	*
	* @param state - the session state to plan for.
	* @param dueAt - an explicit next wake time, or `undefined` for the natural one.
	*/
	plan(state, dueAt) {
		if (this.disposed || !state.roundOpen) {
			this.stopTimer(state);
			return;
		}
		const settings = this.settingsFor(state.sessionId);
		if (settings === void 0 || !settings.enabled || state.snapshot === void 0) {
			this.stopTimer(state);
			return;
		}
		const now = Date.now();
		const toolWait = state.running && state.toolCount > 0;
		const deadline = state.idleStartedAt === void 0 ? void 0 : state.idleStartedAt + settings.idleTimeoutMs;
		const idleOpen = !state.running && deadline !== void 0 && now < deadline;
		if (!toolWait && !idleOpen) {
			this.cancelWarm(state, "window-closed");
			this.stopTimer(state);
			return;
		}
		const natural = (state.lastRefreshAt ?? now) + settings.intervalMs;
		const target = Math.max(dueAt ?? natural, state.nextAllowedAt ?? 0);
		if (!toolWait && deadline !== void 0 && target >= deadline) {
			this.cancelWarm(state, "window-closed");
			this.stopTimer(state);
			return;
		}
		this.scheduleAt(state, Math.max(target, now), settings.intervalMs);
	}
	scheduleAt(state, dueAt, intervalMs) {
		if (state.timer !== void 0) {
			if (state.wakeAt === dueAt) return;
			this.stopTimer(state);
		}
		const now = Date.now();
		const due = Number.isFinite(dueAt) ? dueAt : now + intervalMs;
		state.wakeAt = due;
		state.timer = setTimeout(() => {
			state.timer = void 0;
			state.wakeAt = void 0;
			this.wake(state).catch((error) => {
				this.logger.error("warm wake failed session=%s error=%s", state.sessionId, error instanceof Error ? error.message : String(error));
			});
		}, Math.min(Math.max(due - now, 0), MAX_DURATION_MS));
	}
	async wake(state) {
		if (this.disposed) return;
		const settings = this.settingsFor(state.sessionId);
		if (settings === void 0) {
			this.stopTimer(state);
			return;
		}
		const now = Date.now();
		if (state.nextAllowedAt !== void 0 && now < state.nextAllowedAt) {
			this.plan(state);
			return;
		}
		if (mayStartWarmRequest(this.gateFor(state, settings), now)) {
			const attempt = this.warm(state, settings);
			this.guardIdleDeadline(state, settings);
			const outcome = await attempt;
			if (this.disposed) return;
			if (outcome.status === "stale" || outcome.cancelled) return;
			const delay = outcome.status === "failed" ? nextAttemptDelayMs(settings.intervalMs, outcome.failure?.providerRetryAfterMs) : settings.intervalMs;
			this.plan(state, Date.now() + delay);
			return;
		}
		this.plan(state, now + settings.intervalMs);
	}
	/**
	* Keep a wake scheduled for the end of the idle window while a warm request
	* is in flight, so the attempt is cancelled exactly when the window closes
	* instead of running until its own request timeout.
	*
	* @param state - the session whose attempt is in flight.
	* @param settings - the session's resolved settings.
	*/
	guardIdleDeadline(state, settings) {
		if (state.running || state.idleStartedAt === void 0) return;
		const deadline = state.idleStartedAt + settings.idleTimeoutMs;
		this.scheduleAt(state, Math.max(deadline, Date.now()), settings.intervalMs);
	}
	gateFor(state, settings) {
		return {
			enabled: settings.enabled,
			hasSnapshot: state.snapshot !== void 0,
			foregroundRequests: state.foregroundRequests,
			warmInFlight: state.warm !== void 0,
			running: state.running,
			toolCount: state.toolCount,
			idleDeadline: state.idleStartedAt === void 0 ? void 0 : state.idleStartedAt + settings.idleTimeoutMs
		};
	}
	/**
	* Issue one warm request and report how it settled.
	*
	* @param state - the session state that owns the attempt.
	* @returns the attempt outcome, including the provider backoff it asked for.
	*/
	async warm(state, settings) {
		const snapshot = state.snapshot;
		if (snapshot === void 0) return {
			status: "failed",
			failure: void 0,
			cancelled: false
		};
		const version = state.version;
		const attempt = {
			controller: new AbortController(),
			version,
			cancelled: false
		};
		const timeout = setTimeout(() => attempt.controller.abort(), KEEPALIVE_REQUEST_TIMEOUT_MS);
		state.warm = attempt;
		const startedAt = Date.now();
		let request;
		let route = "unknown";
		let failure;
		let usage;
		let finishedNormally = false;
		try {
			request = createWarmRequest(snapshot, attempt.controller.signal);
			this.ownRequests.add(request);
			route = `${request.provider}/${request.model}`;
			this.logger.info("warm start session=%s route=%s", state.sessionId, route);
			for await (const chunk of this.ctx.llm.stream(request)) {
				if (chunk.type === "usage") usage = chunk.usage;
				if (chunk.type !== "finish") continue;
				if (chunk.reason.kind === "error" || chunk.reason.kind === "aborted") failure = chunk.reason.failure;
				else finishedNormally = true;
			}
		} catch (error) {
			failure ??= {
				message: error instanceof Error ? error.message : "keepalive request failed",
				code: "keepalive-request-failed"
			};
		} finally {
			clearTimeout(timeout);
			if (request !== void 0) this.ownRequests.delete(request);
			if (state.warm === attempt) state.warm = void 0;
		}
		const aborted = attempt.controller.signal.aborted;
		const status = this.disposed || state.version !== version ? "stale" : attempt.cancelled ? "cancelled" : failure !== void 0 ? aborted ? "aborted" : "failed" : finishedNormally && !aborted ? "ok" : "failed";
		const elapsedMs = Date.now() - startedAt;
		if (status === "ok" || status === "aborted") state.nextAllowedAt = void 0;
		else if (status === "failed") state.nextAllowedAt = Date.now() + retryBackoffMs(settings.intervalMs, failure?.providerRetryAfterMs);
		if (status === "ok") {
			state.lastRefreshAt = Date.now();
			this.logger.info("warm finish session=%s route=%s status=ok ms=%d input=%d output=%d cacheRead=%d cacheWrite=%d", state.sessionId, route, elapsedMs, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0, usage?.cacheReadTokens ?? 0, usage?.cacheWriteTokens ?? 0);
		} else if (status === "failed" || status === "aborted") {
			state.lastRefreshAt = Date.now();
			this.logger.warn("warm error session=%s route=%s status=%s code=%s ms=%d", state.sessionId, route, status, failure?.code ?? "no-terminal-finish", elapsedMs);
		} else this.logger.debug("warm %s session=%s route=%s status=%s ms=%d", "discarded", state.sessionId, route, status, elapsedMs);
		return {
			status,
			failure,
			cancelled: attempt.cancelled
		};
	}
	cancelWarm(state, reason) {
		const attempt = state.warm;
		if (attempt === void 0 || attempt.cancelled) return;
		attempt.cancelled = true;
		this.logger.debug("warm cancel session=%s reason=%s", state.sessionId, reason);
		attempt.controller.abort();
	}
	stopTimer(state) {
		if (state.timer === void 0) return;
		clearTimeout(state.timer);
		state.timer = void 0;
		state.wakeAt = void 0;
	}
};

//#endregion
//#region src/host/index.ts
/** Cordis plugin name used by loader diagnostics. */
const name = "cache-temperature";
/** Services this plugin needs: the model runtime it replays through. */
const inject = ["llm"];
/**
* The plugin's own configuration schema.
*
* The rc.1 Loader resolves this schema and hands the plugin the validated
* `Config`; the session dictionary is a volatile field, so a settings write
* commits into the running reference without remounting the plugin. The
* namespace a configuration surface addresses is the Loader entry id.
*/
const Config = settingsSchema;
/**
* Mount per-session prompt-cache keepalive.
*
* Session preferences live in the plugin's own `Config`, keyed by session id.
* Every timer and warm request belongs to the controller, which the plugin
* fiber disposes on unload.
*
* @param ctx - the plugin context that owns the listeners.
* @param config - the Loader-resolved configuration; its session dictionary is live.
*/
function apply(ctx, config) {
	const controller = new KeepaliveController(ctx, { get: () => ({ sessions: config.sessions.get() }) });
	ctx.effect(() => () => {
		controller.dispose();
	});
	ctx.on("llm/stream", (options, next) => controller.handleStream(options, next));
	ctx.on("tools/execute", (exec, next) => controller.handleTool(exec, next));
	ctx.on("agent/status", (payload) => {
		controller.setStatus(String(payload.agent.id), payload.status);
	});
	ctx.on("agent/disposed", (payload) => {
		controller.dropSession(String(payload.agent.id));
	});
	ctx.on("session/event", (session, event) => {
		if (event.type === "turn/end") controller.endTurn(String(session.id), event.data.reason);
	});
	ctx.on("session/disposed", (session) => {
		controller.dropSession(String(session.id));
	});
	ctx.on("loader/volatile-update", () => {
		controller.settingsChanged();
	});
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
	const agents = ctx.get("agents");
	if (agents !== void 0) for (const agent of agents.list()) controller.setStatus(String(agent.id), agent.status);
}

//#endregion
export { Config, apply, inject, name };