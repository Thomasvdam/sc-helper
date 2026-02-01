import { Context, Effect, Layer, Ref, Runtime } from "effect";

export class ClientIdService extends Context.Tag("ClientIdService")<
	ClientIdService,
	{
		getClientId: () => Effect.Effect<string>;
	}
>() {}

export const ClientIdServiceLive = Layer.effect(
	ClientIdService,
	Effect.gen(function* () {
		const runtime = yield* Effect.runtime();

		const clientIdRef = yield* Ref.make<string>("NOT_SET");
		const idAvailable = yield* Effect.makeLatch();

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

		yield* Effect.logDebug("Client ID service initialized");

		const getClientId = () =>
			Effect.gen(function* () {
				yield* idAvailable.await;
				return yield* Ref.get(clientIdRef);
			});

		return {
			getClientId,
		};
	}),
);
