type DatadomeCookieRequest = {
	type: "get-datadome-cookie";
};

type DatadomeCookieResponse = {
	datadomeCookie: string | null;
};

const datadomeCookieUrls = ["https://soundcloud.com/", "https://api-v2.soundcloud.com/"];

chrome.runtime.onMessage.addListener(
	(message: DatadomeCookieRequest, _sender, sendResponse: (response: DatadomeCookieResponse) => void) => {
		if (message?.type !== "get-datadome-cookie") {
			return;
		}

		void findDatadomeCookie().then((datadomeCookie) => sendResponse({ datadomeCookie }));
		return true;
	},
);

async function findDatadomeCookie() {
	for (const url of datadomeCookieUrls) {
		try {
			const cookie = await chrome.cookies.get({ url, name: "datadome" });
			if (cookie?.value) {
				return cookie.value;
			}
		} catch {
			// Continue with the other SoundCloud cookie scope if one is unavailable.
		}
	}

	return null;
}
