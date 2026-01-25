import { parse } from "valibot";
import { defaultOptions, type Options, optionsSchema } from "./options-schema";

function getInputElements() {
	const inputElements: Record<string, HTMLInputElement> = {};

	Object.keys(defaultOptions).forEach((key) => {
		const element = document.getElementById(key);
		if (!element) throw new Error(`Options element for "${key}" not present.`);

		inputElements[key] = element as HTMLInputElement;
	});

	return inputElements as Record<keyof Options, HTMLInputElement>;
}

function assertKey(key: string): asserts key is keyof Options {
	if (key in defaultOptions) return;
	throw new Error(`"${key}" not in options.`);
}

function restoreOptions() {
	chrome.storage.sync.get(defaultOptions, (optionsRaw) => {
		const options = parse(optionsSchema, optionsRaw);

		const inputElements = getInputElements();

		for (const [key, value] of Object.entries(options)) {
			assertKey(key);
			inputElements[key].value = value.toString();
		}
	});
}

function saveOptions() {
	const inputElements = getInputElements();
	const options: Options = {} as Options;

	for (const [key, element] of Object.entries(inputElements)) {
		assertKey(key);

		const inputType = element.getAttribute("type");
		const value = inputType === "number" ? Number(element.value) : element.value;
		// @ts-expect-error No clue why it thinks assigning makes it never.
		options[key] = value;
	}

	chrome.storage.sync.set(options);
}

function restoreDefaults() {
	chrome.storage.sync.set(defaultOptions);
	restoreOptions();
}

function closeOptions() {
	window.close();
}

document.addEventListener("DOMContentLoaded", () => {
	restoreOptions();
	document.getElementById("save")?.addEventListener("click", saveOptions);
	document.getElementById("cancel")?.addEventListener("click", closeOptions);
	document.getElementById("reset")?.addEventListener("click", restoreDefaults);
});
