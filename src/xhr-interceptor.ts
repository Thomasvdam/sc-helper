// XHR Interceptor - runs in MAIN world to intercept page's XMLHttpRequest
// This file is injected into the page's main world, not the isolated content script world

// TODO: Extract client ID
// TODO: Add tracks request interceptor, check the representation

(() => {
	// @ts-expect-error - window.__XHR_INTERCEPTED__ is custom
	if (window.__XHR_INTERCEPTED__) return; // Prevent double injection
	// @ts-expect-error - window.__XHR_INTERCEPTED__ is custom
	window.__XHR_INTERCEPTED__ = true;

	const OriginalXHR = window.XMLHttpRequest;
	const originalOpen = XMLHttpRequest.prototype.open;
	const originalSend = XMLHttpRequest.prototype.send;

	console.log("[Early XHR Interceptor]: Injected into main world and active");

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
		const requestUrl = xhr._monitoredUrl || "";

		const loadHandler = () => {
			if (requestUrl.includes("soundcloud.com/stream")) {
				try {
					const responseText = xhr.responseText;
					try {
						const data = JSON.parse(responseText);
						window.dispatchEvent(new CustomEvent("streamResponse", { detail: data }));
					} catch {
						// Not JSON, that's ok
					}
				} catch (err) {
					console.error("[Early Stream Error]:", err);
				}
			}
		};

		xhr.addEventListener("load", loadHandler);
		return originalSend.apply(this, args);
	};

	// Also proxy the constructor
	window.XMLHttpRequest = new Proxy(OriginalXHR, {
		construct(target) {
			const xhr = new target();
			return xhr;
		},
	}) as typeof XMLHttpRequest;

	console.log("[Early XHR Interceptor]: Setup complete");
})();
