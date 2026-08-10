import { Context, Effect, Layer, Runtime } from "effect";
import type { ConfigService } from "./config";
import { ensureIndicatorRoot } from "./loading-state";
import type { SoundcloudClientService } from "./soundcloud-client-service";
import { TodoPlaylist } from "./todo-playlist";
import type { TrackLikesService } from "./track-likes-service";

export class TodoPlaylistControls extends Context.Tag("TodoPlaylistControls")<TodoPlaylistControls, void>() {}

const navigationEvent = "main-world-route-change";
const playlistControlsId = "sc-helper-playlist-controls";

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

		let actionButton: HTMLButtonElement | null = null;
		let domObserver: MutationObserver | null = null;

		const isTodoPlaylistPage = (location = window.location.href) =>
			normalizeNavigationLocation(todoPlaylist.getPermalinkUrl()) === normalizeNavigationLocation(location);

		const isPlaylistPage = (location = window.location.href) => {
			const pathSegments = new URL(location, window.location.origin).pathname.split("/").filter(Boolean);
			const setsIndex = pathSegments.indexOf("sets");
			return setsIndex === pathSegments.length - 2;
		};

		const getPageAction = (location = window.location.href) => {
			if (isTodoPlaylistPage(location)) return "cleanup" as const;
			if (isPlaylistPage(location)) return "copy" as const;
			return null;
		};

		const removeActionButton = () => {
			if (actionButton) logDebug("Removed playlist action button");
			actionButton?.remove();
			actionButton = null;
			document.getElementById(playlistControlsId)?.remove();
		};

		const stopWaitingForDOM = () => {
			if (domObserver) logDebug("Stopped waiting for playlist controls");
			domObserver?.disconnect();
			domObserver = null;
		};

		const addActionButton = (controls: HTMLElement, action: "cleanup" | "copy") => {
			if (actionButton?.isConnected && actionButton.dataset.action === action) return;
			if (actionButton) {
				actionButton.remove();
				actionButton = null;
			}

			logDebug("Added playlist action button to SC Helper UI", { controlsId: controls.id });

			actionButton = document.createElement("button");
			actionButton.type = "button";
			actionButton.dataset.action = action;
			actionButton.className = `sc-helper-${action}-button`;
			actionButton.textContent = action === "cleanup" ? "Clean up liked tracks" : "Copy unliked tracks";
			actionButton.title =
				action === "cleanup"
					? "Remove liked tracks from this playlist"
					: "Read this playlist and add tracks you have not liked to your todo playlist";
			actionButton.style.cssText = `
				width: 100%;
				padding: 5px 8px;
				border: 1px solid rgba(255, 255, 255, 0.35);
				border-radius: 4px;
				background: #ff5500;
				color: #fff;
				cursor: pointer;
				font: inherit;
				font-weight: 600;
				line-height: 1.4;
				white-space: nowrap;
			`;
			const button = actionButton;

			button.addEventListener("click", () => {
				if (button.disabled) return;

				button.disabled = true;
				button.textContent = action === "cleanup" ? "Cleaning up…" : "Copying…";

				const handleFailure = (error: unknown) => {
					logError(`Failed to ${action === "cleanup" ? "clean up" : "copy playlist"}`, error);
					if (!button.isConnected) return;
					button.textContent = action === "cleanup" ? "Cleanup failed — try again" : "Copy failed — try again";
					button.disabled = false;
				};

				if (action === "cleanup") {
					Runtime.runPromise(runtime, todoPlaylist.cleanUpLikedTracks()).then(({ removedCount, remainingCount }) => {
						if (!button.isConnected) return;
						logDebug("Cleanup completed", { removedCount, remainingCount });
						button.textContent = `Removed ${removedCount} liked track${removedCount === 1 ? "" : "s"} (${remainingCount} remaining)`;
						button.disabled = false;
					}, handleFailure);
					return;
				}

				Runtime.runPromise(
					runtime,
					todoPlaylist.copyUnlikedTracksFromPlaylist(normalizeNavigationLocation(window.location.href)),
				).then((result) => {
					if (!button.isConnected) return;
					logDebug("Playlist copy completed", result);
					button.textContent =
						result.addedCount === 0
							? "No new unliked tracks"
							: `Added ${result.addedCount} unliked track${result.addedCount === 1 ? "" : "s"}`;
					button.disabled = false;
				}, handleFailure);
			});

			controls.append(button);
		};

		const injectWhenReady = () => {
			const action = getPageAction();
			if (!action) {
				stopWaitingForDOM();
				removeActionButton();
				return;
			}

			const root = ensureIndicatorRoot();
			if (!root) return;

			let controls = root.querySelector<HTMLElement>(`#${playlistControlsId}`);
			if (!controls) {
				controls = document.createElement("div");
				controls.id = playlistControlsId;
				controls.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-top: 8px;";
				root.append(controls);
			}

			addActionButton(controls, action);
			stopWaitingForDOM();
		};

		const waitForDOM = (navigationLocation = window.location.href) => {
			const targetAction = getPageAction(navigationLocation);
			const currentAction = getPageAction();
			const currentMatches =
				normalizeNavigationLocation(navigationLocation) === normalizeNavigationLocation(window.location.href);
			logDebug("Evaluated playlist location", {
				targetLocation: navigationLocation,
				currentLocation: window.location.href,
				targetAction,
				currentAction,
				currentMatches,
			});

			if (!targetAction) {
				logDebug("Cleared playlist control state after leaving configured playlist");
				stopWaitingForDOM();
				removeActionButton();
				return;
			}

			if (!currentMatches || currentAction !== targetAction) {
				removeActionButton();
			}

			if (currentMatches) {
				injectWhenReady();
			}
			if (actionButton?.isConnected && actionButton.dataset.action === targetAction && currentMatches) return;
			if (domObserver) {
				return;
			}
			if (!document.documentElement) {
				logDebug("Cannot wait for playlist controls: document.documentElement is missing");
				return;
			}

			logDebug("Waiting for playlist controls in SC Helper UI", { controlsId: playlistControlsId });
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
