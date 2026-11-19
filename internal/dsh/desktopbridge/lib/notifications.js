import { randomUUID } from "node:crypto";

const RUN_WAIT = 350;
const POLL = 450;
const NORMAL_POLL = 3000;
const LOG_LIMIT = 4096;
const pendingKinds = { "approval/request": "approval", "user-questions/request": "question" };
const slot = Symbol.for("deepseek-harness-desktop.notifications.host");

// 只观察已提交回合与网关中的等待事实，不进入两个回答 waterfall。
export function observeNotifications(ctx, send, readPrefs) {
	const get = (name) => ctx.get?.(name);
	const prior = globalThis[slot];
	const persisted = prior || { turns: new Map(), running: new Set(), pending: new Map(), goals: new Map(), outcomes: new Map(), plans: new Map(), candidates: new Set() };
	globalThis[slot] = persisted;
	const { turns, running, pending, goals, outcomes, plans, candidates } = persisted;
	let disposed = false;
	let prefs = prior?.prefs || null;
	let establishBaseline = prior === undefined;
	let nextPrefsAt = 0;
	let poll;
	let outbound = Promise.resolve();
	let queueSize = 0;
	const timers = new Map();
	const isSession = (session) => {
		const id = session?.id || session?.header?.id;
		if (!id || session?.header?.origin === "subagent" || !session?.header?.cwd) return false;
		return !get("workspaceRegistry")?.archivedSessionIds?.includes?.(id);
	};
	const sessionFor = (id) => get("sessions")?.get?.(id) || get("agents")?.get?.(id)?.session;
	const report = (kind, sessionId, key, closed = false) => {
		if (queueSize >= 128) return;
		queueSize++;
		const payload = { kind, sessionId, key, closed };
		outbound = outbound.then(() => !disposed && send(payload)).catch(() => {}).finally(() => { queueSize--; });
	};
	const pendingKey = (id, kind) => `${id}:${kind}`;
	const remember = (map, key, value) => {
		if (!map.has(key) && map.size >= LOG_LIMIT) map.delete(map.keys().next().value);
		map.set(key, value);
	};
	const gatewayPending = () => get("typertGateway")?.getPendingRemoteEvents?.() || [];
	const continuedQuestion = (id) => {
		const session = sessionFor(id);
		if (!isSession(session)) return false;
		const view = get("sessionProjections")?.snapshot?.(session, ["userQuestions"])?.values?.userQuestions;
		return view?.active?.some(item => item.state === "continued") === true;
	};
	const pendingQuestion = (id) => continuedQuestion(id) || gatewayPending().some(item => item.agentId === id && item.event === "user-questions/request");
	const goalOf = (id) => {
		const agent = get("agents")?.get?.(id);
		return agent && get("goal")?.get?.(agent);
	};
	const setRunning = (id, isRunning) => {
		if (isRunning === running.has(id)) return;
		if (isRunning) running.add(id);
		else running.delete(id);
		report("running", id, "active", !isRunning);
	};
	const flush = (id) => {
		const row = outcomes.get(id);
		if (!row) return;
		outcomes.delete(id);
		if (row.kind === "completed") {
			if (pendingQuestion(id)) return;
			if (running.has(id)) {
				remember(outcomes, id, row);
				return;
			}
			const goal = !row.goal && goalOf(id);
			if (goal?.phase === "active" && goal.activation === "armed") return;
		}
		if (row.allowed && isSession(sessionFor(id))) report(row.kind, id, row.key);
	};
	const later = (id, delay = RUN_WAIT) => {
		clearTimeout(timers.get(id));
		timers.set(id, setTimeout(() => {
			timers.delete(id);
			try { flush(id); } catch { /* 通知不影响 DSH */ }
		}, delay));
	};
	const started = (id, turn) => {
		const old = outcomes.get(id);
		if (old?.kind === "completed" && !old.goal) outcomes.delete(id);
		remember(turns, id, { turn, finalAt: 0 });
		setRunning(id, true);
	};
	const observeEvent = (session, event) => {
		if (!isSession(session)) return;
		const id = session.id || session.header.id;
		const { type, data, seq } = event || {};
		if (type === "tool/call" && data?.name === "exit_plan_mode" && turns.has(id)) {
			remember(plans, id, data.callId);
		}
		if (type === "tool/result" && plans.has(id) && plans.get(id) === data?.message?.toolCallId) plans.delete(id);
		if (type === "tool/ptc-dispatch" && data?.name === "ask_user_question" && turns.has(id) && candidates.size < LOG_LIMIT) candidates.add(id);
		if (type === "turn/start") {
			started(id, data?.turn);
			return;
		}
		if (type === "goal/change") {
			const kind = data?.operation === "complete" ? "completed" : data?.operation === "block" ? "interrupted" : "";
			if (!kind) return;
			remember(goals, id, turns.get(id)?.turn);
			remember(outcomes, id, { key:`goal:${seq}`, kind, goal:true, allowed: prefs?.enabled === true && prefs[kind] !== false });
			later(id);
			return;
		}
		if (type !== "turn/end" || !turns.has(id) || turns.get(id)?.turn !== data?.turn) return;
		plans.delete(id);
		const reason = data?.reason?.kind;
		const kind = reason === "completed" || reason === "error" ? reason : ["blocked", "max-tokens"].includes(reason) ? "interrupted" : "";
		remember(turns, id, { turn: data?.turn, finalAt: Date.now() });
		if (outcomes.get(id)?.kind === "error" && outcomes.get(id)?.fallback) outcomes.delete(id);
		if (!kind || (kind === "completed" && goals.has(id) && goals.get(id) === data?.turn)) return;
		if (outcomes.get(id)?.goal && kind !== "error") return;
		remember(outcomes, id, { kind, key:`turn:${seq}`, allowed: prefs?.enabled === true && prefs[kind] !== false });
		later(id);
	};
	const off = [
		ctx.on("session/event", (session, event) => { try { observeEvent(session, event); } catch {} }),
		ctx.on("api-session/status", (id, isRunning) => {
			if (isRunning && !isSession(sessionFor(id))) return;
			setRunning(id, isRunning);
			if (!isRunning && outcomes.has(id)) later(id);
		}),
		ctx.on("api-session/error", (id) => {
			if (!isSession(sessionFor(id)) || Date.now() - (turns.get(id)?.finalAt || 0) < 800 || outcomes.has(id)) return;
			remember(outcomes, id, { kind:"error", key:`error:${randomUUID()}`, fallback:true, allowed: prefs?.enabled === true && prefs.error !== false });
			later(id, 650);
		}),
		ctx.on("api-session/removed", (id) => {
			setRunning(id, false);
			turns.delete(id);
			goals.delete(id);
			outcomes.delete(id);
			clearTimeout(timers.get(id));
			timers.delete(id);
		})
	];
	const setPrefs = (next) => {
		if (!next) {
			nextPrefsAt = Date.now() + NORMAL_POLL;
			return;
		}
		const enabledNow = next.enabled && !prefs?.enabled;
		prefs = persisted.prefs = next;
		nextPrefsAt = Date.now() + 30000;
		if (enabledNow && poll !== undefined) {
			establishBaseline = true;
			clearTimeout(poll);
			poll = setTimeout(scan, 0);
		}
	};
	for (const id of outcomes.keys()) later(id);
	async function scan() {
		poll = undefined;
		try {
			if (Date.now() >= nextPrefsAt) {
				const requestedAt = nextPrefsAt;
				const next = await readPrefs();
				if (disposed) return;
				if (requestedAt === nextPrefsAt) setPrefs(next);
			}
			if (disposed) return;
			if (!prefs?.enabled && pending.size === 0) return;
			const now = new Map();
			for (const event of gatewayPending()) {
				const kind = Object.hasOwn(pendingKinds, event?.event) ? pendingKinds[event.event] : "";
				const id = event?.agentId;
				if (kind && isSession(sessionFor(id))) now.set(pendingKey(id, kind), { kind, id });
			}
			const continuedIDs = new Set([...candidates, ...[...pending.values()].filter(item => item.kind === "question").map(item => item.id)]);
			for (const id of continuedIDs) {
				const key = pendingKey(id, "question");
				if (continuedQuestion(id)) now.set(key, { kind: "question", id });
				else if (!now.has(key)) candidates.delete(id);
			}
			for (const [key, state] of pending) {
				if (now.has(key)) continue;
				// 给计时询问转为可继续回答留出一个投影同步窗口。
				if (state.kind === "question" && state.misses++ < 1) continue;
				report(state.kind, state.id, state.key, true);
				pending.delete(key);
			}
			for (const [key, item] of now) {
				if (pending.has(key)) { pending.get(key).misses = 0; continue; }
				const token = randomUUID();
				remember(pending, key, { ...item, key: token, misses: 0 });
				if (!establishBaseline && prefs?.enabled && prefs[item.kind]) {
					report(item.kind === "question" && plans.has(item.id) ? "plan-review" : item.kind, item.id, token);
				}
			}
			establishBaseline = false;
		} catch { /* 保持最后一次可信快照 */ }
		finally { if (!disposed) poll = setTimeout(scan, prefs?.enabled || pending.size ? POLL : NORMAL_POLL); }
	}
	void scan();
	return {
		setPrefs,
		dispose() {
			disposed = true;
			clearTimeout(poll);
			for (const timer of timers.values()) clearTimeout(timer);
			for (const remove of off) if (typeof remove === "function") remove();
		}
	};
}
