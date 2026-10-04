import { Context, Effect, Latch, Layer, MutableHashSet, Schema } from "effect";

export class TrackLikesService extends Context.Service<
	TrackLikesService,
	{
		isLiked: (id: string | number) => Effect.Effect<boolean>;
		likesAvailable: Latch.Latch;
	}
>()("TrackLikesService") {}

export const TrackLikesServiceLive = Layer.effect(
	TrackLikesService,
	Effect.gen(function* () {
		const services = yield* Effect.context();
		const set = MutableHashSet.empty<string>();
		const likesAvailable = yield* Latch.make();

		window.addEventListener("response-track_likes", ((event: CustomEvent) => {
			Effect.runSyncWith(services)(
				Effect.gen(function* () {
					const response = yield* decodeTrackLikesResponse(event.detail);
					yield* Effect.logTrace(
						`Track likes response from ${response.requestUrl}, ${response.data.collection.length} IDs`,
					);

					for (const id of response.data.collection) {
						MutableHashSet.add(set, String(id));
					}

					if (!response.data.next_href) {
						yield* Effect.logInfo("All likes fetched");
						yield* likesAvailable.open;
					}
				}),
			);
		}) as EventListener);

		const isLiked = (id: string | number) =>
			Effect.sync(() => MutableHashSet.has(set, String(id))).pipe(likesAvailable.whenOpen);

		yield* Effect.logDebug("Track likes service initialized");

		return { isLiked, likesAvailable };
	}),
);

const TrackLikesResponseSchema = Schema.Struct({
	data: Schema.Struct({
		collection: Schema.Array(Schema.Number),
		next_href: Schema.NullOr(Schema.String),
		query_urn: Schema.NullOr(Schema.Unknown),
	}),
	requestUrl: Schema.String,
});

const decodeTrackLikesResponse = Schema.decodeUnknownEffect(TrackLikesResponseSchema);
