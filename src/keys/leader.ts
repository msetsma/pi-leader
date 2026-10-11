import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AppKeybinding,
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type EditorComponent,
	getKeybindings,
	isKeyRelease,
	isKeyRepeat,
	Key,
	type KeybindingDefinitions,
	type KeybindingsConfig,
	KeybindingsManager,
	type KeyId,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { Sequencer, type TrieNode } from "./sequencer.ts";

type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;

/** The editor pi-leader installed, or another extension's editor it wraps. */
type Editor = EditorComponent & { actionHandlers?: Map<AppKeybinding, () => void> };

export interface LeaderAction {
	/** Keys after the leader, space-separated, e.g. "p o". Bound under every leader. */
	keys: string;
	description: string;
	run(editor: Editor, ctx: ExtensionContext): void;
}

const LEADERS = ["space", "ctrl+space"];
const CONFIG_PATH = join(getAgentDir(), "pi-leader.json");

/** Run a built-in app action (`app.*` id in core/keybindings.ts) through the editor's handlers. */
export const appAction =
	(id: AppKeybinding) =>
	(editor: Editor): void =>
		editor.actionHandlers?.get(id)?.();

/**
 * Run a built-in slash command through the editor's submit handler, which
 * handles it locally (pi.sendUserMessage would send it to the model). The
 * handler clears the editor, so put a draft back.
 */
export const slashCommand =
	(command: string) =>
	(editor: Editor, ctx: ExtensionContext): void => {
		const draft = editor.getText();
		editor.onSubmit?.(command);
		if (draft) ctx.ui.setEditorText(draft);
	};

const MODIFIERS = ["ctrl", "shift", "alt", "super"];
const BASE_KEYS = new Set(Object.values(Key).flatMap((value) => (typeof value === "string" ? [value.toLowerCase()] : [])));

/** Canonical key id (lowercase, modifiers in a fixed order), or undefined when invalid. Mirrors core's KeyIdSchema. */
function normalizeKeyId(token: string): string | undefined {
	const match = /^((?:(?:ctrl|shift|alt|super)\+)*)(.+)$/.exec(token.toLowerCase());
	if (!match) return undefined;
	const mods = match[1]!.split("+").filter(Boolean);
	const key = match[2]!;
	if (new Set(mods).size !== mods.length || !(/^[a-z0-9]$/.test(key) || BASE_KEYS.has(key))) return undefined;
	return [...MODIFIERS.filter((mod) => mods.includes(mod)), key].join("+");
}

function normalizeSequence(sequence: string): string | undefined {
	const tokens = sequence.trim().split(/\s+/).map(normalizeKeyId);
	return tokens.every((token) => token !== undefined) ? tokens.join(" ") : undefined;
}

function readConfig(warnings: string[]): Record<string, unknown> {
	try {
		const raw: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
		if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
		warnings.push(`${CONFIG_PATH}: expected a JSON object`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") warnings.push(`${CONFIG_PATH}: ${String(error)}`);
	}
	return {};
}

/**
 * Leader-key sequences with a which-key hint, plus `/keys`.
 * `space` starts a sequence only when the editor is focused and empty (or
 * pi-vim reports normal mode); modified leaders such as `ctrl+space` start
 * whenever the editor is focused.
 */
export function setupLeaderKeys(pi: ExtensionAPI): void {
	const actions: Record<string, LeaderAction> = {
		"pi-leader.session.tree": { keys: "t", description: "Session tree", run: appAction("app.session.tree") },
		"pi-leader.model.select": { keys: "m", description: "Select model", run: appAction("app.model.select") },
		"pi-leader.settings": { keys: "s", description: "Settings", run: slashCommand("/settings") },
		"pi-leader.reload": { keys: "r", description: "Reload", run: slashCommand("/reload") },
		"pi-leader.keys": { keys: "k", description: "List leader keys", run: (_editor, ctx) => showKeys(ctx) },
		"pi-leader.outline": {
			keys: "p o",
			description: "Toggle outline panel",
			// Provided by pi-outline. Without it, onSubmit would send "/outline" to the model.
			run: (editor, ctx) => {
				if (pi.getCommands().some((c) => c.source === "extension" && c.name === "outline"))
					slashCommand("/outline")(editor, ctx);
				else ctx.ui.notify("/outline is not available (install pi-outline)", "warning");
			},
		},
	};

	let tui: TUI | undefined;
	let editor: Editor | undefined;
	let ownFactory: EditorFactory | undefined;
	let ctx: ExtensionContext | undefined;
	let vimMode: string | undefined;
	let unsubscribe: (() => void) | undefined;
	let keymap: { id: string; sequences: string[] }[] = [];
	let warnings: string[] = [];

	pi.events.on("pi-vim:mode-change", (data) => {
		vimMode = typeof data === "string" ? data : (data as { mode?: string } | undefined)?.mode;
	});

	const editorFocused = () => editor !== undefined && tui?.getFocusedComponent() === editor;
	const sequencer = new Sequencer({
		matches: (data, key) => matchesKey(data, key as KeyId),
		isRelease: isKeyRelease,
		isRepeat: isKeyRepeat,
		isCancel: (data) => getKeybindings().matches(data, "tui.select.cancel"),
		canStart: (key) =>
			editorFocused() && (/(ctrl|alt|super)\+/.test(key) || editor?.getText() === "" || vimMode === "normal"),
		focused: () => tui?.getFocusedComponent(),
		replay: (data) => {
			tui?.getFocusedComponent()?.handleInput?.(data);
			tui?.requestRender();
		},
		fire: (binding) => {
			if (editor && ctx) actions[binding.id]?.run(editor, ctx);
			tui?.requestRender();
		},
		onPending: (node, prefix) =>
			ctx?.ui.setWidget("pi-leader.whichkey", node ? (_t, theme) => whichKey(node, prefix, theme) : undefined),
	});

	const whichKey = (node: TrieNode, prefix: string[], theme: Theme) => ({
		render: (width: number) => {
			const items = [...node.children].map(([key, child]) => {
				const label = child.children.size > 0 ? `+${child.children.size}` : (child.binding?.description ?? "");
				return `${theme.fg("accent", key)} ${theme.fg("muted", label)}`;
			});
			const lines = [theme.fg("dim", `${prefix.join(" ")} …`)];
			let line = "";
			for (const item of items) {
				if (line && visibleWidth(line) + 3 + visibleWidth(item) > width) {
					lines.push(line);
					line = "";
				}
				line = line ? `${line}   ${item}` : item;
			}
			if (line) lines.push(line);
			return lines.map((text) => truncateToWidth(text, width));
		},
		invalidate() {},
	});

	/** Rebuild the trie from defaults plus ~/.pi/agent/pi-leader.json. */
	const loadKeymap = () => {
		warnings = [];
		const config = readConfig(warnings);
		const definitions: KeybindingDefinitions = {};
		for (const [id, action] of Object.entries(actions)) {
			const defaults = LEADERS.map((leader) => `${leader} ${action.keys}`);
			definitions[id] = { defaultKeys: defaults as KeyId[], description: action.description };
		}
		const user: KeybindingsConfig = {};
		for (const [id, value] of Object.entries(config)) {
			if (id === "timeoutMs" || id === "$schema") continue;
			if (!(id in actions)) {
				warnings.push(`unknown action "${id}"`);
				continue;
			}
			const sequences: string[] = [];
			for (const sequence of Array.isArray(value) ? value : [value]) {
				const normalized = typeof sequence === "string" ? normalizeSequence(sequence) : undefined;
				if (normalized) sequences.push(normalized);
				else warnings.push(`${id}: invalid key sequence ${JSON.stringify(sequence)}`);
			}
			user[id] = sequences as KeyId[];
		}
		// The manager resolves user overrides over defaults ([] unbinds). Duplicate
		// sequences are reported by the trie below, which also catches user vs default.
		const manager = new KeybindingsManager(definitions, user);

		sequencer.cancel();
		sequencer.root.children.clear();
		sequencer.timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : 1000;
		keymap = [];
		for (const [id, keys] of Object.entries(manager.getResolvedBindings())) {
			const sequences = keys === undefined ? [] : Array.isArray(keys) ? keys : [keys];
			keymap.push({ id, sequences });
			for (const sequence of sequences) {
				const added = sequencer.add({ id, keys: sequence.split(" "), description: definitions[id]!.description ?? id });
				if (!added) warnings.push(`"${sequence}" is bound twice; ${id} ignored`);
			}
		}
	};

	const showKeys = (context: ExtensionContext) => {
		const lines = keymap.map(({ id, sequences }) => {
			const keys = sequences.length > 0 ? sequences.join(", ") : "(unbound)";
			return `${keys}  →  ${id}  ${actions[id]?.description ?? ""}`;
		});
		const header = `Leader keys (${CONFIG_PATH}, timeout ${sequencer.timeoutMs}ms):`;
		context.ui.notify([header, ...lines, ...warnings.map((w) => `warning: ${w}`)].join("\n"), "info");
	};

	pi.registerCommand("keys", {
		description: "List leader key sequences",
		handler: async (_args, context) => showKeys(context),
	});

	pi.on("session_start", (_event, context) => {
		if (context.mode !== "tui") return;
		ctx = context;
		loadKeymap();
		if (warnings.length > 0) context.ui.notify(`pi-leader keys: ${warnings.join("; ")}`, "warning");

		// Own the editor so leaders can tell when it is focused and dispatch through
		// its actionHandlers/onSubmit. If another extension installed an editor
		// first, keep it and only record the instance. An editor installed after
		// this one replaces it, and leaders stay off until the next session_start.
		const current = context.ui.getEditorComponent();
		const inner = current === ownFactory ? undefined : current;
		ownFactory = (t, theme, keybindings) => {
			tui = t;
			editor = inner?.(t, theme, keybindings) ?? new CustomEditor(t, theme, keybindings, { embedWorkingStatus: true });
			return editor;
		};
		context.ui.setEditorComponent(ownFactory);

		unsubscribe?.();
		unsubscribe = context.ui.onTerminalInput((data) => (sequencer.feed(data) ? { consume: true } : undefined));
	});

	pi.on("session_shutdown", () => {
		ctx = undefined;
		sequencer.cancel();
		unsubscribe?.();
		unsubscribe = undefined;
		editor = undefined;
		tui = undefined;
	});
}
