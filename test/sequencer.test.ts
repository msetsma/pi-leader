import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { type Binding, Sequencer } from "../src/keys/sequencer.ts";

let focus = "editor";
let log: string[] = [];
let seq: Sequencer;

beforeEach(() => {
	mock.timers.reset();
	mock.timers.enable({ apis: ["setTimeout"] });
	focus = "editor";
	log = [];
	seq = new Sequencer({
		// "rep:x" is an auto-repeat of x; it would match x if not for the repeat check.
		matches: (data, key) => data.replace(/^rep:/, "") === (key === "space" ? " " : key),
		isRelease: (data) => data === "release",
		isRepeat: (data) => data.startsWith("rep:"),
		isCancel: (data) => data === "esc",
		canStart: () => true,
		focused: () => focus,
		replay: (data) => log.push(`replay ${data}`),
		fire: (binding: Binding) => log.push(`fire ${binding.id}`),
		onPending: (node, prefix) => log.push(node ? `pending ${prefix.join(" ")}` : "idle"),
	});
	for (const [id, keys] of [
		["tree", "space t"],
		["outline", "space p o"],
		["files", "space f f"],
		["find", "space f"],
	] as const) {
		seq.add({ id, keys: keys.split(" "), description: id });
	}
});

const feed = (...keys: string[]) => keys.map((key) => seq.feed(key));

test("rejects a duplicate binding", () => {
	assert.equal(seq.add({ id: "dup", keys: ["space", "t"], description: "" }), false);
});

test("exact match fires and consumes", () => {
	assert.deepEqual(feed(" ", "p", "o"), [true, true, true]);
	assert.deepEqual(log, ["pending space", "pending space p", "idle", "fire outline"]);
});

test("exact match that is also a prefix fires on timeout", () => {
	feed(" ", "f");
	mock.timers.tick(999);
	assert.ok(!log.includes("fire find"));
	mock.timers.tick(1);
	assert.deepEqual(log.slice(-2), ["idle", "fire find"]);
});

test("exact match that is also a prefix can still extend", () => {
	feed(" ", "f", "f");
	mock.timers.tick(5000);
	assert.deepEqual(log.slice(-2), ["idle", "fire files"]);
});

test("timeout with no exact match replays the prefix", () => {
	feed(" ", "p");
	mock.timers.tick(1000);
	assert.deepEqual(log.slice(-3), ["idle", "replay  ", "replay p"]);
});

test("mismatch replays the prefix and passes the key through", () => {
	assert.deepEqual(feed(" ", "x"), [true, false]);
	assert.deepEqual(log.slice(-2), ["idle", "replay  "]);
});

test("mismatch key can start a new sequence", () => {
	assert.deepEqual(feed(" ", " "), [true, true]);
	assert.deepEqual(log, ["pending space", "idle", "replay  ", "pending space"]);
});

test("key releases pass through untouched", () => {
	assert.deepEqual(feed(" ", "release", "t"), [true, false, true]);
	assert.equal(log.at(-1), "fire tree");
});

test("an auto-repeat is a mismatch", () => {
	assert.deepEqual(feed(" ", "p", "rep:p"), [true, true, false]);
	assert.deepEqual(log.slice(-3), ["idle", "replay  ", "replay p"]);
	mock.timers.tick(5000);
	assert.ok(!log.some((entry) => entry.startsWith("fire")));
});

test("an auto-repeat after an exact match that is also a prefix fires it", () => {
	assert.deepEqual(feed(" ", "f", "rep:f"), [true, true, false]);
	assert.deepEqual(log.slice(-2), ["idle", "fire find"]);
	mock.timers.tick(5000);
	assert.equal(log.filter((entry) => entry.startsWith("fire")).length, 1);
});

test("mismatch after an exact match that is also a prefix fires it", () => {
	assert.deepEqual(feed(" ", "f", "x"), [true, true, false]);
	assert.deepEqual(log.slice(-2), ["idle", "fire find"]);
	assert.ok(!log.some((entry) => entry.startsWith("replay")));
});

test("mismatch deeper than an exact match fires it and replays only the keys after it", () => {
	seq.add({ id: "deep", keys: ["space", "f", "g", "h"], description: "" });
	assert.deepEqual(feed(" ", "f", "g", "x"), [true, true, true, false]);
	assert.deepEqual(log.slice(-3), ["idle", "fire find", "replay g"]);
});

test("timeout deeper than an exact match fires it and replays only the keys after it", () => {
	seq.add({ id: "deep", keys: ["space", "f", "g", "h"], description: "" });
	feed(" ", "f", "g");
	mock.timers.tick(1000);
	assert.deepEqual(log.slice(-3), ["idle", "fire find", "replay g"]);
});

test("cancel key clears without replay", () => {
	assert.deepEqual(feed(" ", "p", "esc"), [true, true, true]);
	mock.timers.tick(5000);
	assert.deepEqual(log, ["pending space", "pending space p", "idle"]);
});

test("focus change cancels without replay", () => {
	feed(" ", "p");
	focus = "overlay";
	assert.deepEqual(feed("o"), [false]);
	assert.deepEqual(log.slice(-1), ["idle"]);
	assert.ok(!log.some((entry) => entry.startsWith("replay") || entry.startsWith("fire")));
});

test("focus change before timeout cancels without replay or fire", () => {
	feed(" ", "f");
	focus = "overlay";
	mock.timers.tick(1000);
	assert.deepEqual(log.slice(-1), ["idle"]);
	assert.ok(!log.some((entry) => entry.startsWith("replay") || entry.startsWith("fire")));
});

test("gated leader does not start", () => {
	const gated = new Sequencer({
		matches: (data, key) => data === key,
		isRelease: () => false,
		isRepeat: () => false,
		isCancel: () => false,
		canStart: () => false,
		focused: () => focus,
		replay: () => {},
		fire: () => {},
		onPending: () => {},
	});
	gated.add({ id: "x", keys: ["a", "b"], description: "" });
	assert.equal(gated.feed("a"), false);
});
