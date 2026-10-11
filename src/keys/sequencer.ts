/**
 * Vim-style key sequence matcher (a key trie with `timeoutlen` semantics).
 * Pure: no host-package imports, so `node --test` runs it without node_modules.
 * Key matching, focus and replay are injected by the caller.
 */

export interface Binding {
	id: string;
	keys: string[];
	description: string;
}

export interface TrieNode {
	binding?: Binding;
	children: Map<string, TrieNode>;
}

export interface SequencerHooks {
	/** Whether raw terminal `data` is the key `key` (a key id like "ctrl+space"). */
	matches(data: string, key: string): boolean;
	isRelease(data: string): boolean;
	/** Kitty auto-repeat event (key held down). */
	isRepeat(data: string): boolean;
	isCancel(data: string): boolean;
	/** Whether a sequence may start with root key `key` right now. */
	canStart(key: string): boolean;
	/** The focused component; compared by identity. */
	focused(): unknown;
	/** Send swallowed input on to the focused component. */
	replay(data: string): void;
	fire(binding: Binding): void;
	/** Called with the node awaiting its next key, or undefined when the sequence ends. */
	onPending(node: TrieNode | undefined, prefix: string[]): void;
}

export class Sequencer {
	readonly root: TrieNode = { children: new Map() };
	timeoutMs = 1000;
	private hooks: SequencerHooks;
	private node: TrieNode | undefined;
	private prefix: string[] = [];
	private swallowed: string[] = [];
	/** Deepest complete binding passed, and how many swallowed keys it covers. */
	private match: { binding: Binding; length: number } | undefined;
	private focus: unknown;
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(hooks: SequencerHooks) {
		this.hooks = hooks;
	}

	/** Add a binding. Returns false when its exact sequence is already bound. */
	add(binding: Binding): boolean {
		let node = this.root;
		for (const key of binding.keys) {
			let child = node.children.get(key);
			if (!child) {
				child = { children: new Map() };
				node.children.set(key, child);
			}
			node = child;
		}
		if (node.binding) return false;
		node.binding = binding;
		return true;
	}

	/** Feed raw terminal input. Returns true when it was consumed. */
	feed(data: string): boolean {
		if (this.hooks.isRelease(data)) return false;
		if (this.node) {
			if (this.hooks.focused() !== this.focus) {
				this.cancel();
			} else if (this.hooks.isCancel(data)) {
				this.cancel();
				return true;
			} else {
				// A held key auto-repeats; treating that as the next key would fire
				// out of order, so a repeat is a mismatch.
				const next = this.hooks.isRepeat(data) ? undefined : this.find(this.node, data);
				if (next) return this.advance(next[0], next[1], data);
				this.resolve();
			}
		}
		const start = this.find(this.root, data);
		if (!start || !this.hooks.canStart(start[0])) return false;
		this.focus = this.hooks.focused();
		return this.advance(start[0], start[1], data);
	}

	/** Drop any pending sequence without replaying it. */
	cancel(): void {
		clearTimeout(this.timer);
		this.timer = undefined;
		const wasPending = this.node !== undefined;
		this.node = undefined;
		this.prefix = [];
		this.swallowed = [];
		this.match = undefined;
		if (wasPending) this.hooks.onPending(undefined, []);
	}

	private find(node: TrieNode, data: string): [string, TrieNode] | undefined {
		for (const entry of node.children) if (this.hooks.matches(data, entry[0])) return entry;
		return undefined;
	}

	private advance(key: string, node: TrieNode, data: string): boolean {
		clearTimeout(this.timer);
		if (node.children.size === 0) {
			this.cancel();
			if (node.binding) this.hooks.fire(node.binding);
			return true;
		}
		this.node = node;
		this.prefix.push(key);
		this.swallowed.push(data);
		if (node.binding) this.match = { binding: node.binding, length: this.swallowed.length };
		this.timer = setTimeout(() => this.timeout(), this.timeoutMs);
		this.hooks.onPending(node, [...this.prefix]);
		return true;
	}

	private timeout(): void {
		if (this.hooks.focused() !== this.focus) this.cancel();
		else this.resolve();
	}

	/** Vim `timeoutlen`: fire the longest complete binding passed, replay the keys after it, go idle. */
	private resolve(): void {
		const { match, swallowed } = this;
		this.cancel();
		if (match) this.hooks.fire(match.binding);
		for (const data of swallowed.slice(match?.length ?? 0)) this.hooks.replay(data);
	}
}
