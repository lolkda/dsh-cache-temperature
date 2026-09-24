import type { Context } from '@deepseek-ai/cordis';
import { type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { TurnEndReason } from '@deepseek-ai/dsh-session';
import { type KeepaliveSettingsDocument } from '../shared/settings.ts';
/**
 * The controller's read face over the live keepalive document.
 *
 * The rc.1 Loader owns the plugin's `Config`, so the controller never registers
 * a settings namespace: the plugin hands it a reader over the resolved
 * document, and the Loader announces volatile commits separately.
 */
export interface SettingsSource {
    /** @returns the current resolved document; never mutated by the controller. */
    get(): KeepaliveSettingsDocument;
}
/**
 * Per-session prompt-cache keepalive scheduling.
 *
 * The controller owns every timer and request the plugin issues. It never
 * appends to a session log, never dispatches a tool, and never drives an agent
 * turn: a warm cycle only replays the last successful real agent request with
 * the smallest output budget it can ask for and its own abort signal. The
 * provider SDK may raise that budget to its own minimum, which is accepted.
 */
export declare class KeepaliveController {
    private readonly ctx;
    private readonly source;
    private readonly logger;
    private readonly sessions;
    private readonly ownRequests;
    private disposed;
    constructor(ctx: Context, source: SettingsSource);
    /**
     * Observe one model call. Real agent-loop requests preempt warm work
     * immediately, and a normally completed one becomes the next replay source.
     *
     * @param options - the request offered to the `llm/stream` waterfall.
     * @param next - downstream chain producing the model chunk stream.
     * @returns the chunk stream, or the untouched downstream stream.
     */
    handleStream(options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
    /**
     * Observe one tool dispatch so a long tool wait stays warmable, and so the
     * wait has no idle cap. The cancellation listener is removed with the
     * dispatch, so a later signal cleanup cannot read as a user stop.
     *
     * @param exec - the allowed call about to dispatch.
     * @param next - downstream dispatch chain.
     * @returns the dispatch result.
     */
    handleTool(exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult>;
    /**
     * Mirror an `agent/status` transition. Running status alone never cancels
     * warm work; it only closes the idle window to new warm requests.
     *
     * @param sessionId - the session whose agent changed status.
     * @param status - the status just entered.
     */
    setStatus(sessionId: string, status: 'idle' | 'running'): void;
    /**
     * Close one turn. A normal completion opens the idle window; any other
     * reason ends the round until the next successful real request.
     *
     * @param sessionId - the session whose turn ended.
     * @param reason - the durable turn end reason.
     */
    endTurn(sessionId: string, reason: TurnEndReason): void;
    /** Re-evaluate every session after the settings document changed. */
    settingsChanged(): void;
    /** Forget one session whose agent or session left the runtime. */
    dropSession(sessionId: string): void;
    /** Cancel every timer and in-flight warm request; late results are ignored. */
    dispose(): void;
    private stateFor;
    /**
     * Read one session's settings. An unreadable document degrades the feature to
     * off for that session and is reported, but never breaks a real request.
     */
    private settingsFor;
    private observeRealRequest;
    /**
     * Recompute the next wake from the session's anchors: the refresh cadence
     * runs from the last settled request or warm attempt, the idle window from
     * its own start, and a tool wait has no idle cap at all.
     *
     * @param state - the session state to plan for.
     * @param dueAt - an explicit next wake time, or `undefined` for the natural one.
     */
    private plan;
    private scheduleAt;
    private wake;
    /**
     * Keep a wake scheduled for the end of the idle window while a warm request
     * is in flight, so the attempt is cancelled exactly when the window closes
     * instead of running until its own request timeout.
     *
     * @param state - the session whose attempt is in flight.
     * @param settings - the session's resolved settings.
     */
    private guardIdleDeadline;
    private gateFor;
    /**
     * Issue one warm request and report how it settled.
     *
     * @param state - the session state that owns the attempt.
     * @returns the attempt outcome, including the provider backoff it asked for.
     */
    private warm;
    private cancelWarm;
    private stopTimer;
}
