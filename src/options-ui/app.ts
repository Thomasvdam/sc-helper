import { Effect } from "effect";
import { type Config, defaultConfig, getConfig } from "../lib/config";

function getFormElements(): Record<keyof Config, HTMLInputElement | HTMLSelectElement> {
	const elements: Record<string, HTMLInputElement | HTMLSelectElement> = {};

	for (const key of Object.keys(defaultConfig) as (keyof Config)[]) {
		const element = document.getElementById(key);
		if (!element) throw new Error(`Form element for "${key}" not present.`);
		if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
			throw new Error(`Element "${key}" must be an input or select`);
		}
		elements[key] = element;
	}

	return elements as Record<keyof Config, HTMLInputElement | HTMLSelectElement>;
}

function assertKey(key: string): asserts key is keyof Config {
	if (key in defaultConfig) return;
	throw new Error(`"${key}" not in config.`);
}

function restoreConfig() {
	Effect.runPromise(
		Effect.gen(function* () {
			const config = yield* getConfig();

			const elements = getFormElements();
			for (const [key, value] of Object.entries(config)) {
				assertKey(key);
				elements[key].value = value.toString();
			}
		}),
	);
}

function saveConfig() {
	const elements = getFormElements();
	const config = {} as { -readonly [P in keyof Config]: Config[P] };

	for (const [key, element] of Object.entries(elements)) {
		assertKey(key);

		const value =
			element instanceof HTMLInputElement && element.getAttribute("type") === "number"
				? Number(element.value)
				: element.value;
		// @ts-expect-error No clue why it thinks assigning makes it never.
		config[key] = value;
	}

	chrome.storage.sync.set(config, closeConfig);
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
