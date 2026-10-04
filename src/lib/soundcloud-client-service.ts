import { Context, Effect, Latch, Layer, Redacted, Ref } from "effect";

export class SoundcloudClientService extends Context.Service<
	SoundcloudClientService,
	{
		getClientId: () => Effect.Effect<string>;
		getAuthHeader: () => Effect.Effect<Redacted.Redacted>;
		getDatadomeCookie: () => Effect.Effect<string>;
	}
>()("SoundcloudClientService") {}

export const SoundcloudClientServiceLive = Layer.effect(
	SoundcloudClientService,
	Effect.gen(function* () {
		const services = yield* Effect.context();

		const clientIdRef = yield* Ref.make<string>("NOT_SET");
		const idAvailable = yield* Latch.make();

		const authHeaderRef = yield* Ref.make<Redacted.Redacted>(Redacted.make("NOT_SET"));
		const authHeaderAvailable = yield* Latch.make();

		const datadomeCookieRef = yield* Ref.make<string>("NOT_SET");
		const datadomeCookieAvailable = yield* Latch.make();

		const setDatadomeCookie = (datadomeCookie: string) =>
			Effect.gen(function* () {
				yield* Effect.logInfo("Setting datadome cookie");
				yield* Ref.set(datadomeCookieRef, datadomeCookie);
				yield* datadomeCookieAvailable.open;
			});

		window.addEventListener("soundcloud-client-id", ((event: CustomEvent) => {
			Effect.runSyncWith(services)(
				Effect.gen(function* () {
					const clientId = event.detail;
					yield* Effect.logInfo(`Setting client ID to ${clientId}`);
					yield* Ref.set(clientIdRef, clientId);
					yield* idAvailable.open;
				}),
			);
		}) as EventListener);

		window.addEventListener("soundcloud-auth-header", ((event: CustomEvent) => {
			Effect.runSyncWith(services)(
				Effect.gen(function* () {
					const authHeader = Redacted.make(event.detail);
					yield* Effect.logInfo(`Setting auth header`);
					yield* Ref.set(authHeaderRef, authHeader);
					yield* authHeaderAvailable.open;
				}),
			);
		}) as EventListener);

		window.addEventListener("soundcloud-datadome-cookie", ((event: CustomEvent) => {
			Effect.runSyncWith(services)(
				Effect.gen(function* () {
					const datadomeCookie = event.detail;
					yield* setDatadomeCookie(datadomeCookie);
				}),
			);
		}) as EventListener);

		void requestDatadomeCookieFromExtension().then((datadomeCookie) => {
			if (datadomeCookie) {
				Effect.runSyncWith(services)(setDatadomeCookie(datadomeCookie));
			}
		});

		yield* Effect.logDebug("Soundcloud client service initialized");

		const getClientId = () =>
			Effect.gen(function* () {
				yield* idAvailable.await;
				return yield* Ref.get(clientIdRef);
			});

		const getAuthHeader = () =>
			Effect.gen(function* () {
				yield* authHeaderAvailable.await;
				return yield* Ref.get(authHeaderRef);
			});

		const getDatadomeCookie = () =>
			Effect.gen(function* () {
				yield* datadomeCookieAvailable.await;
				return yield* Ref.get(datadomeCookieRef);
			});

		return {
			getAuthHeader,
			getClientId,
			getDatadomeCookie,
		};
	}),
);

type DatadomeCookieResponse = {
	datadomeCookie?: string | null;
};

function requestDatadomeCookieFromExtension() {
	return new Promise<string | null>((resolve) => {
		chrome.runtime.sendMessage({ type: "get-datadome-cookie" }, (response?: DatadomeCookieResponse) => {
			if (chrome.runtime.lastError) {
				resolve(null);
				return;
			}

			resolve(response?.datadomeCookie ?? null);
		});
	});
}
