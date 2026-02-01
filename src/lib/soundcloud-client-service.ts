import { Context, Effect, Layer, Redacted, Ref, Runtime } from "effect";

export class SoundcloudClientService extends Context.Tag("SoundcloudClientService")<
	SoundcloudClientService,
	{
		getClientId: () => Effect.Effect<string>;
		getAuthHeader: () => Effect.Effect<Redacted.Redacted>;
		getDatadomeCookie: () => Effect.Effect<string>;
	}
>() {}

export const SoundcloudClientServiceLive = Layer.effect(
	SoundcloudClientService,
	Effect.gen(function* () {
		const runtime = yield* Effect.runtime();

		const clientIdRef = yield* Ref.make<string>("NOT_SET");
		const idAvailable = yield* Effect.makeLatch();

		const authHeaderRef = yield* Ref.make<Redacted.Redacted>(Redacted.make("NOT_SET"));
		const authHeaderAvailable = yield* Effect.makeLatch();

		const datadomeCookieRef = yield* Ref.make<string>("NOT_SET");
		const datadomeCookieAvailable = yield* Effect.makeLatch();

		window.addEventListener("soundcloud-client-id", ((event: CustomEvent) => {
			Runtime.runSync(
				runtime,
				Effect.gen(function* () {
					const clientId = event.detail;
					yield* Effect.logInfo(`Setting client ID to ${clientId}`);
					yield* Ref.set(clientIdRef, clientId);
					yield* idAvailable.open;
				}),
			);
		}) as EventListener);

		window.addEventListener("soundcloud-auth-header", ((event: CustomEvent) => {
			Runtime.runSync(
				runtime,
				Effect.gen(function* () {
					const authHeader = Redacted.make(event.detail);
					yield* Effect.logInfo(`Setting auth header`);
					yield* Ref.set(authHeaderRef, authHeader);
					yield* authHeaderAvailable.open;
				}),
			);
		}) as EventListener);

		window.addEventListener("soundcloud-datadome-cookie", ((event: CustomEvent) => {
			Runtime.runSync(
				runtime,
				Effect.gen(function* () {
					const datadomeCookie = event.detail;
					yield* Effect.logInfo(`Setting datadome cookie to ${datadomeCookie}`);
					yield* Ref.set(datadomeCookieRef, datadomeCookie);
					yield* datadomeCookieAvailable.open;
				}),
			);
		}) as EventListener);

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
