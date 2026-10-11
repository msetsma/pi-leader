import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Offline model for the demo recording: replies with canned text, no network.
export default function (pi: ExtensionAPI) {
	const faux = fauxProvider({
		provider: "demo",
		models: [{ id: "demo-model", name: "Demo Model", contextWindow: 200_000, reasoning: true }],
		tokensPerSecond: 400,
	});
	const replies = [
		"The login handler checks the session cookie, then loads the user from the cache.",
		"Added a test for expired sessions. All 12 tests pass.",
	];
	faux.setResponses(Array.from({ length: 50 }, (_, i) => () => fauxAssistantMessage(replies[i % replies.length]!)));
	pi.registerProvider(faux.provider);
}
