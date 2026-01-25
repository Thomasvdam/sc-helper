// Config
import * as v from "valibot";
import { fetchPlaylistTrackIds } from "./lib/fetch-playlist";
import { getPermalink, type Permalink } from "./lib/permalink";
import { StreamResponseSchema } from "./lib/stream-response";
import { defaultOptions, optionsSchema } from "./options-schema";

let hackyCallback: () => void;
const loadingPlaylistPromise = new Promise<void>(
	// biome-ignore lint/suspicious/noAssignInExpressions: This is a hacky way to be able to resolve a promise from a different function.
	(res) => (hackyCallback = res),
);

// Global mutable state never caused any problems. :)
const state = {
	loadingPlaylistPromise,
	playlistIds: new Set([] as string[]),
	stream: new Map<Permalink, { id: string; isSet: boolean }>(),
};

// Initialize the extension and load the config
chrome.storage.sync.get(defaultOptions, async (items) => {
	const config = v.parse(optionsSchema, items);
	console.log("[SC Helper] Loaded config:", config);

	function hasSetDuration(duration_ms: number): boolean {
		return duration_ms > config.set_duration_threshold_minutes * 60 * 1_000;
	}

	// Listen for stream responses from the XHR interceptor and add them to the state
	window.addEventListener("streamResponse", ((event: CustomEvent) => {
		const parsed = v.parse(StreamResponseSchema, event.detail);
		for (const item of parsed.collection) {
			if (item.track) {
				const permalink = getPermalink(item.track.permalink_url);

				state.stream.set(permalink, {
					id: item.track.id.toString(),
					isSet: hasSetDuration(item.track.duration),
				});
			}
		}
	}) as EventListener);

	async function loadPlaylist(playlistId: string) {
		const playlistIds = await fetchPlaylistTrackIds(config.client_id, playlistId);

		state.playlistIds = playlistIds;

		// Let the rest of the 'app' know we're good to go.
		hackyCallback();
	}

	// Track processed items to avoid duplicates
	// TODO: make it use permalinks only? Smaller size
	// TODO: reset on navigations
	const processedItems = new Set<Element>();

	async function onDomMutation() {
		await state.loadingPlaylistPromise;

		const soundListItems = document.querySelectorAll<HTMLElement>("li.soundList__item");

		if (!soundListItems) {
			return;
		}

		const newSoundListItems: HTMLElement[] = [];
		soundListItems.forEach((item) => {
			if (processedItems.has(item)) {
				return;
			}

			newSoundListItems.push(item);
		});

		for (const soundListItem of newSoundListItems) {
			if (isPlaylist(soundListItem)) {
				addSkippedReason(soundListItem, "playlist");
				continue;
			}

			if (isLiked(soundListItem)) {
				addSkippedReason(soundListItem, "liked");
				continue;
			}

			const permalink = getPermalinkFromSoundListItem(soundListItem);
			if (!permalink) {
				console.warn("No permalink found, skipping...");
				addSkippedReason(soundListItem, "no permalink");
				continue;
			}

			if (!isInStream(permalink)) {
				// Not in stream yet, we'll wait for the stream response to be processed.
				continue;
			}

			if (isInPlaylist(permalink)) {
				addSkippedReason(soundListItem, "in playlist");
				continue;
			}

			if (!isSet(permalink)) {
				addSkippedReason(soundListItem, "not a set");
				continue;
			}

			markSoundListItemAsNewSet(soundListItem);
		}
	}

	function addSkippedReason(soundListItem: HTMLElement, reason: string) {
		processedItems.add(soundListItem);
		soundListItem.setAttribute("title", reason);
		soundListItem.style.opacity = "0.2";
	}

	function isPlaylist(soundListItem: Element) {
		const playlistElement = soundListItem.querySelector(".playlist");
		return !!playlistElement;
	}

	function isLiked(soundListItem: Element) {
		const selectedLikeButton = soundListItem.querySelector("button.sc-button-like.sc-button-selected");
		return !!selectedLikeButton;
	}

	function getPermalinkFromSoundListItem(soundListItem: Element) {
		const linkElement = soundListItem.querySelector<HTMLAnchorElement>("div.soundTitle a.sc-link-primary");

		if (!linkElement) {
			return null;
		}

		return getPermalink(linkElement.href);
	}

	function isInPlaylist(permalink: string) {
		const id = state.stream.get(permalink)?.id;
		if (!id) {
			console.warn("No id found for permalink:", permalink);
			return false;
		}

		return state.playlistIds.has(id);
	}

	function isInStream(permalink: string) {
		return state.stream.has(permalink);
	}

	function isSet(permalink: string) {
		return state.stream.get(permalink)?.isSet ?? false;
	}

	function markSoundListItemAsNewSet(soundListItem: Element) {
		processedItems.add(soundListItem);
		// TODO: Add to playlist button
		const statsContainer = soundListItem.querySelector("ul.soundStats");

		if (!statsContainer) {
			return;
		}

		const setItem = document.createElement("li");
		setItem.classList.add("sc-ministats-item");
		const icon = document.createElement("span");
		icon.classList.add("sc-ministats", "sc-ministats-small", "sc-ministats-sounds", "sc-text-secondary");
		icon.style.backgroundColor = "#ff5500";
		icon.style.margin = "0";
		icon.style.padding = "6px";
		icon.style.borderRadius = "15px";

		setItem.append(icon);
		statsContainer.append(setItem);
	}

	// Bootstrap and run on page changes
	function addMutationObserver(callback: typeof onDomMutation) {
		const config = { attributes: false, childList: true, subtree: true };
		const observer = new MutationObserver(callback);
		observer.observe(document.body, config);
	}

	addMutationObserver(onDomMutation);
	loadPlaylist(config.playlist_id);
	onDomMutation();
});
