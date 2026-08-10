import { Context, Effect, Layer, Runtime } from "effect";
import type { ConfigService } from "./config";
import type { SoundcloudClientService } from "./soundcloud-client-service";
import { TodoPlaylist } from "./todo-playlist";
import type { TrackLikesService } from "./track-likes-service";

export class TodoPlaylistControls extends Context.Tag("TodoPlaylistControls")<TodoPlaylistControls, void>() {}

const playlistControlsSelectors = ["div.listenEngagement__footer", "div.sc-button-group.sc-button-group-medium"].join(
	", ",
);

const navigationEvent = "main-world-route-change";

const normalizeNavigationLocation = (value: string) => {
	const url = new URL(value, window.location.origin);
	url.search = "";
	url.hash = "";

	return `${url.origin}${url.pathname.replace(/\/+$/, "") || "/"}`;
};

export const TodoPlaylistControlsLive = Layer.effect(
	TodoPlaylistControls,
	Effect.gen(function* () {
		const todoPlaylist = yield* TodoPlaylist;
		const runtime = yield* Effect.runtime<ConfigService | SoundcloudClientService | TrackLikesService>();

		const logDebug = (message: string, details?: unknown) =>
			Runtime.runSync(runtime, Effect.logDebug(message).pipe(Effect.annotateLogs({ details })));
		const logError = (message: string, error: unknown) => Runtime.runSync(runtime, Effect.logError(message, error));

		let cleanupButton: HTMLButtonElement | null = null;
		let domObserver: MutationObserver | null = null;

		const isTodoPlaylistPage = (location = window.location.href) =>
			normalizeNavigationLocation(todoPlaylist.getPermalinkUrl()) === normalizeNavigationLocation(location);

		const removeCleanupButton = () => {
			if (cleanupButton) logDebug("Removed cleanup button");
			cleanupButton?.remove();
			cleanupButton = null;
		};

		const stopWaitingForDOM = () => {
			if (domObserver) logDebug("Stopped waiting for playlist controls");
			domObserver?.disconnect();
			domObserver = null;
		};

		const addCleanupButton = (controls: HTMLElement) => {
			if (cleanupButton?.isConnected) return;

			logDebug("Injected cleanup button", {
				controlsId: controls.id,
				controlsClassName: controls.className,
			});

			cleanupButton = document.createElement("button");
			cleanupButton.type = "button";
			cleanupButton.className = "sc-button sc-button-medium sc-helper-cleanup-button";
			cleanupButton.textContent = "Clean up liked tracks";
			cleanupButton.title = "Remove liked tracks from this playlist";
			cleanupButton.style.marginLeft = "8px";

			cleanupButton.addEventListener("click", () => {
				if (!cleanupButton || cleanupButton.disabled) return;

				cleanupButton.disabled = true;
				cleanupButton.textContent = "Cleaning up…";

				Runtime.runPromise(runtime, todoPlaylist.cleanUpLikedTracks()).then(
					({ removedCount, remainingCount }) => {
						logDebug("Cleanup completed", { removedCount, remainingCount });
						if (!cleanupButton) return;
						cleanupButton.textContent = `Removed ${removedCount} liked track${removedCount === 1 ? "" : "s"} (${remainingCount} remaining)`;
						cleanupButton.disabled = false;
					},
					(error) => {
						logError("Failed to clean up liked tracks", error);
						if (!cleanupButton) return;
						cleanupButton.textContent = "Cleanup failed — try again";
						cleanupButton.disabled = false;
					},
				);
			});

			controls.append(cleanupButton);
		};

		const injectWhenReady = () => {
			if (!isTodoPlaylistPage()) {
				stopWaitingForDOM();
				removeCleanupButton();
				return;
			}

			const controls = document.querySelector<HTMLElement>(playlistControlsSelectors);
			if (!controls) return;

			addCleanupButton(controls);
			stopWaitingForDOM();
		};

		const waitForDOM = (navigationLocation = window.location.href) => {
			const targetMatches = isTodoPlaylistPage(navigationLocation);
			const currentMatches = isTodoPlaylistPage();
			logDebug("Evaluated playlist location", {
				targetLocation: navigationLocation,
				currentLocation: window.location.href,
				targetMatches,
				currentMatches,
			});

			if (!targetMatches) {
				logDebug("Cleared playlist control state after leaving configured playlist");
				stopWaitingForDOM();
				removeCleanupButton();
				return;
			}

			if (isTodoPlaylistPage()) injectWhenReady();
			if (cleanupButton?.isConnected) {
				return;
			}
			if (domObserver) {
				return;
			}
			if (!document.documentElement) {
				logDebug("Cannot wait for playlist controls: document.documentElement is missing");
				return;
			}

			logDebug("Waiting for playlist controls", { selector: playlistControlsSelectors });
			domObserver = new MutationObserver(injectWhenReady);
			domObserver.observe(document.documentElement, { childList: true, subtree: true });
		};

		window.addEventListener(navigationEvent, ((event: CustomEvent<{ url?: string }>) => {
			waitForDOM(event.detail.url ?? window.location.href);
		}) as EventListener);
		waitForDOM();

		logDebug("Todo playlist controls initialized", { permalinkUrl: todoPlaylist.getPermalinkUrl() });
	}),
);
