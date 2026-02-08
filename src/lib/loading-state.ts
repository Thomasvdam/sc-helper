import { Context, Effect, Layer, Ref } from "effect";
import { SoundcloudClientService } from "./soundcloud-client-service";
import { TrackLikesService } from "./track-likes-service";

type ServiceStatus = "likes" | "clientId" | "auth" | "datadome";

type LoadingState = Record<ServiceStatus, boolean>;

const initialLoadingState: LoadingState = {
	likes: false,
	clientId: false,
	auth: false,
	datadome: false,
};

class LoadingStateService extends Context.Tag("LoadingStateService")<LoadingStateService, Ref.Ref<LoadingState>>() {}
export const LoadingStateLive = Layer.effect(LoadingStateService, Ref.make(initialLoadingState));

const LABELS: Record<ServiceStatus, string> = {
	likes: "Likes",
	clientId: "Client ID",
	auth: "Auth",
	datadome: "Datadome",
};

function ensureIndicatorRoot(): HTMLElement {
	let root = document.getElementById("sc-helper-loading-indicator");
	if (!root) {
		root = document.createElement("div");
		root.id = "sc-helper-loading-indicator";
		root.style.cssText = `
			position: fixed;
			top: 12px;
			right: 12px;
			z-index: 2147483647;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			font-size: 12px;
			background: rgba(0,0,0,0.85);
			color: #eee;
			padding: 8px 12px;
			border-radius: 8px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.3);
			line-height: 1.5;
		`;
		root.innerHTML =
			'<div style="font-weight:600;">SC Helper <span id="sc-helper-loading-title-suffix" style="opacity:0;">✓</span></div><div id="sc-helper-loading-rows"></div>';
		document.body.appendChild(root);
	}
	return root;
}

function allReady(state: LoadingState): boolean {
	return (Object.keys(state) as ServiceStatus[]).every((k) => state[k]);
}

function updateIndicatorDOM(state: LoadingState) {
	const root = document.getElementById("sc-helper-loading-indicator");
	const loadingTitleSuffixEl = document.getElementById("sc-helper-loading-title-suffix");
	const rowsEl = document.getElementById("sc-helper-loading-rows");
	if (!root || !rowsEl || !loadingTitleSuffixEl) return;

	if (allReady(state)) {
		loadingTitleSuffixEl.style.opacity = "1";
		rowsEl.innerHTML = "";
		return;
	}

	root.style.display = "";
	const loadingEntries = (Object.keys(LABELS) as ServiceStatus[])
		.filter((key) => !state[key])
		.map((key) => ({ key, label: LABELS[key] }));

	rowsEl.innerHTML = loadingEntries
		.map(
			({ label }) =>
				`<div style="display:flex;align-items:center;gap:6px;"><span style="width:16px;">…</span><span>${label}</span></div>`,
		)
		.join("");
}

const waitForBody = Effect.async<HTMLElement>((resume) => {
	if (document.body) {
		resume(Effect.succeed(document.body));
		return;
	}
	const observer = new MutationObserver(() => {
		if (document.body) {
			observer.disconnect();
			resume(Effect.succeed(document.body));
		}
	});
	observer.observe(document.documentElement, { childList: true });
});

export const mountLoadingIndicator = Effect.gen(function* () {
	const ref = yield* LoadingStateService;
	yield* waitForBody;
	const state = yield* Ref.get(ref);
	yield* Effect.sync(() => {
		ensureIndicatorRoot();
		updateIndicatorDOM(state);
	});
	return ref;
});

export const refreshLoadingIndicator = (ref: Ref.Ref<LoadingState>) =>
	Effect.gen(function* () {
		const state = yield* Ref.get(ref);
		yield* Effect.sync(() => updateIndicatorDOM(state));
	});

const setServiceReadyAndRefresh = (ref: Ref.Ref<LoadingState>, key: ServiceStatus) =>
	Effect.gen(function* () {
		yield* Ref.update(ref, (s) => ({ ...s, [key]: true }));
		yield* refreshLoadingIndicator(ref);
	});

/** Mounts the indicator and schedules all service waits; updates the display whenever a result comes in. */
export const runLoadingIndicator = Effect.gen(function* () {
	const ref = yield* mountLoadingIndicator;
	const trackLikes = yield* TrackLikesService;
	const soundcloud = yield* SoundcloudClientService;

	const waitAndMark = (key: ServiceStatus, wait: Effect.Effect<unknown>) =>
		Effect.forkDaemon(
			wait.pipe(
				Effect.andThen(setServiceReadyAndRefresh(ref, key)),
				Effect.catchAll(() => Effect.void),
			),
		);

	yield* waitAndMark("likes", trackLikes.likesAvailable.await);
	yield* waitAndMark("clientId", soundcloud.getClientId());
	yield* waitAndMark("auth", soundcloud.getAuthHeader());
	yield* waitAndMark("datadome", soundcloud.getDatadomeCookie());
});
