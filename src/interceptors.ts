// XHR Interceptor - runs in MAIN world to intercept page's XMLHttpRequest
// This file is injected into the page's main world, not the isolated content script world

import { parse as parseCookie } from "cookie";

let previousClientId: string | null = null;
let previousAuthHeader: string | null = null;
let previousDatadomeCookie: string | null = null;

(() => {
	// @ts-expect-error - window.__XHR_INTERCEPTED__ is custom
	if (window.__XHR_INTERCEPTED__) return; // Prevent double injection
	// @ts-expect-error - window.__XHR_INTERCEPTED__ is custom
	window.__XHR_INTERCEPTED__ = true;

	const OriginalXHR = window.XMLHttpRequest;
	const originalOpen = XMLHttpRequest.prototype.open;
	const originalSend = XMLHttpRequest.prototype.send;
	const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

	console.log("[Interceptors]: Injected into main world and active");

	// Override prototype methods
	XMLHttpRequest.prototype.open = function (
		method: string,
		url: string | URL,
		async?: boolean,
		username?: string | null,
		password?: string | null,
	) {
		const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : "";
		(this as XMLHttpRequest & { _monitoredUrl?: string })._monitoredUrl = urlString;
		return originalOpen.call(this, method, url, async ?? true, username, password);
	};

	XMLHttpRequest.prototype.send = function (...args: Parameters<typeof XMLHttpRequest.prototype.send>) {
		const xhr = this as XMLHttpRequest & { _monitoredUrl?: string };
		const requestUrl = new URL(xhr._monitoredUrl || "");

		const clientId = requestUrl.searchParams.get("client_id");
		if (clientId && clientId !== previousClientId) {
			previousClientId = clientId;
			window.dispatchEvent(new CustomEvent("soundcloud-client-id", { detail: clientId }));
		}

		const loadHandler = () => {
			if (!requestUrl.hostname.includes("soundcloud.com")) {
				return;
			}

			const headers = this.getAllResponseHeaders();
			if (headers.includes("x-set-cookie")) {
				const cookieHeader = this.getResponseHeader("x-set-cookie");
				if (cookieHeader) {
					const cookie = parseCookie(cookieHeader);
					const datadomeCookie = cookie.datadome;
					if (datadomeCookie && datadomeCookie !== previousDatadomeCookie) {
						previousDatadomeCookie = datadomeCookie;
						window.dispatchEvent(new CustomEvent("soundcloud-datadome-cookie", { detail: datadomeCookie }));
					}
				}
			}

			const streamType = getStreamType(requestUrl);
			if (streamType === null) {
				return;
			}

			try {
				const responseText = xhr.responseText;
				try {
					const data = JSON.parse(responseText);
					window.dispatchEvent(
						new CustomEvent(`response-${streamType}`, {
							detail: { data, requestUrl: requestUrl.toString() },
						}),
					);
				} catch {
					// Not JSON, that's ok
				}
			} catch (err) {
				console.error("[Interceptors_xhr]: Stream error", err);
			}
		};

		xhr.addEventListener("load", loadHandler);
		return originalSend.apply(this, args);
	};

	XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
		if (name.toLowerCase() === "authorization" && value !== previousAuthHeader) {
			previousAuthHeader = value;
			window.dispatchEvent(new CustomEvent("soundcloud-auth-header", { detail: value }));
		}
		return originalSetRequestHeader.call(this, name, value);
	};

	// Also proxy the constructor
	window.XMLHttpRequest = new Proxy(OriginalXHR, {
		construct(target) {
			const xhr = new target();
			return xhr;
		},
	}) as typeof XMLHttpRequest;

	// Listen for page navigations and notify the extension
	window.navigation.addEventListener("navigate", (a) => {
		// Don't trigger on replace navigations
		if (a.navigationType === "replace") {
			return;
		}

		window.dispatchEvent(new CustomEvent("main-world-navigation", {}));
	});

	console.log("[Interceptors]: Setup complete");
})();

function getStreamType(url: URL) {
	if (url.pathname.startsWith("/me/play-history") || url.pathname === "/tracks") {
		return null;
	}

	if (url.pathname.startsWith("/stream")) {
		return "stream";
	}

	if (url.pathname.endsWith("/spotlight") || url.pathname.endsWith("/tracks") || url.pathname.endsWith("/toptracks")) {
		return "tracks";
	}

	return null;
}
