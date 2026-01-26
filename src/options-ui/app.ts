import { Effect } from "effect";
import { type Config, defaultConfig, getConfig } from "../lib/config";

function getInputElements() {
	const inputElements: Record<string, HTMLInputElement> = {};

	Object.keys(defaultConfig).forEach((key) => {
		const element = document.getElementById(key);
		if (!element) throw new Error(`Input element for "${key}" not present.`);

		inputElements[key] = element as HTMLInputElement;
	});

	return inputElements as Record<keyof Config, HTMLInputElement>;
}

function assertKey(key: string): asserts key is keyof Config {
	if (key in defaultConfig) return;
	throw new Error(`"${key}" not in config.`);
}

function restoreConfig() {
	Effect.runSync(
		Effect.gen(function* () {
			const config = yield* getConfig();

			const inputElements = getInputElements();
			for (const [key, value] of Object.entries(config)) {
				assertKey(key);
				inputElements[key].value = value.toString();
			}
		}),
	);
}

function saveConfig() {
	const inputElements = getInputElements();
	const config = {} as { -readonly [P in keyof Config]: Config[P] };

	for (const [key, element] of Object.entries(inputElements)) {
		assertKey(key);

		const inputType = element.getAttribute("type");
		const value = inputType === "number" ? Number(element.value) : element.value;
		// @ts-expect-error No clue why it thinks assigning makes it never.
		config[key] = value;
	}

	chrome.storage.sync.set(config);
}

function restoreDefaults() {
	chrome.storage.sync.set(defaultConfig);
	restoreConfig();
}

function closeConfig() {
	window.close();
}

document.addEventListener("DOMContentLoaded", () => {
	restoreConfig();
	document.getElementById("save")?.addEventListener("click", saveConfig);
	document.getElementById("cancel")?.addEventListener("click", closeConfig);
	document.getElementById("reset")?.addEventListener("click", restoreDefaults);
});
