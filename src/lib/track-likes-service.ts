import { Context, Effect, Layer, MutableHashSet, Runtime, Schema } from "effect";

export class TrackLikesService extends Context.Tag("TrackLikesService")<
	TrackLikesService,
	{
		isLiked: (id: string | number) => Effect.Effect<boolean>;
		likesAvailable: Effect.Latch;
	}
>() {}

export const TrackLikesServiceLive = Layer.effect(
	TrackLikesService,
	Effect.gen(function* () {
		const runtime = yield* Effect.runtime();
		const set = MutableHashSet.empty<string>();
		const likesAvailable = yield* Effect.makeLatch();

		window.addEventListener("response-track_likes", ((event: CustomEvent) => {
			Runtime.runSync(
				runtime,
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
			Effect.succeed(MutableHashSet.has(set, String(id))).pipe(likesAvailable.whenOpen);

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

const decodeTrackLikesResponse = Schema.decodeUnknown(TrackLikesResponseSchema);
