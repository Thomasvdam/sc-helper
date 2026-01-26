import { Context, Data, Effect, Layer, MutableHashSet, Queue, Runtime } from "effect";
import { ConfigService } from "./config";
import { getPermalink } from "./permalink";
import { PermalinkToStreamState } from "./permalink-to-stream-state";
import { TodoPlaylist } from "./todo-playlist";

export class HighlightSetsService extends Context.Tag("HighlightSetsService")<HighlightSetsService, void>() {}

export const HighlightSetsServiceLive = Layer.effect(
	HighlightSetsService,
	Effect.gen(function* () {
		const runtime = yield* Effect.runtime();
		const config = yield* ConfigService;
		const todoPlaylist = yield* TodoPlaylist;
		const permalinkToStreamState = yield* PermalinkToStreamState;

		const processedItems = MutableHashSet.empty<Element>();
		const newSoundListItems = yield* Queue.unbounded<HTMLElement>();

		const findSoundListItems = Effect.gen(function* () {
			const soundListItems = document.querySelectorAll<HTMLElement>("li.soundList__item");

			yield* Effect.logTrace(`Found ${soundListItems.length} sound list items`);

			const newItems: HTMLElement[] = [];
			soundListItems.forEach((item) => {
				if (MutableHashSet.has(processedItems, item)) {
					return;
				}

				MutableHashSet.add(processedItems, item);
				newItems.push(item);
			});

			yield* Effect.logTrace(`Adding ${newItems.length} new sound list items to queue`);
			yield* newSoundListItems.offerAll(newItems);
		});

		// Listen for DOM mutations
		const mutationObserver = new MutationObserver(() => {
			Runtime.runSync(runtime, findSoundListItems);
		});
		mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: false });

		window.addEventListener("main-world-navigation", () => {
			Runtime.runSync(
				runtime,
				Effect.gen(function* () {
					yield* Effect.logDebug("Navigation detected, resetting state");

					MutableHashSet.clear(processedItems);
				}),
			);
		});

		yield* Effect.forkDaemon(
			Effect.gen(function* () {
				const item = yield* newSoundListItems.take;
				yield* Effect.logTrace(`Processing item`);

				const permalink = yield* getPermalinkFromSoundListItem(item);

				yield* Effect.logTrace(`Found permalink ${permalink}`);

				if (isPlaylist(item)) {
					return yield* addSkippedReason(item, "Playlist");
				}

				if (isLiked(item)) {
					return yield* addSkippedReason(item, "Already liked");
				}

				const streamItem = yield* permalinkToStreamState.getStreamEntry(permalink);

				yield* Effect.logTrace(`Stream item:`, streamItem);
				if (todoPlaylist.isInTodoPlaylist(streamItem.id)) {
					return yield* addSkippedReason(item, "Already in todo playlist");
				}

				if (streamItem.duration < config.set_duration_threshold_minutes * 60 * 1_000) {
					return yield* addSkippedReason(item, "Duration is too short");
				}

				yield* Effect.logTrace(`Marking item as new set`);

				markSoundListItemAsNewSet(item);
			}).pipe(
				Effect.tapErrorTag("NoPermalinkError", (error) => Effect.logError(error.message)),
				Effect.catchTags({
					NoPermalinkError: (_) => Effect.succeed(null),
				}),
				Effect.forever,
			),
		);

		yield* Effect.logDebug("Highlight sets service initialized");

		// Trigger an initial DOM parse
		yield* findSoundListItems;
	}),
);

class NoPermalinkError extends Data.TaggedError("NoPermalinkError")<{ message: string }> {}

const getPermalinkFromSoundListItem = (soundListItem: Element) =>
	Effect.gen(function* () {
		const linkElement = soundListItem.querySelector<HTMLAnchorElement>("div.soundTitle a.sc-link-primary");

		if (!linkElement) {
			return yield* new NoPermalinkError({ message: "No permalink found" });
		}

		return yield* getPermalink(linkElement.href);
	});

function isPlaylist(soundListItem: Element) {
	const playlistElement = soundListItem.querySelector(".playlist");
	return !!playlistElement;
}

function isLiked(soundListItem: Element) {
	const selectedLikeButton = soundListItem.querySelector("button.sc-button-like.sc-button-selected");
	return !!selectedLikeButton;
}

const addSkippedReason = (soundListItem: HTMLElement, reason: string) =>
	Effect.gen(function* () {
		yield* Effect.logTrace(`Skipping item because ${reason}`);
		soundListItem.setAttribute("title", reason);
		soundListItem.style.opacity = "0.2";
	});

function markSoundListItemAsNewSet(soundListItem: Element) {
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
