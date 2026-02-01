import { Context, Effect, Layer, Runtime, Schema } from "effect";
import { getPermalink, type Permalink } from "./permalink";
import { PermalinkToStreamState } from "./permalink-to-stream-state";

export class StreamService extends Context.Tag("StreamService")<StreamService, void>() {}

export const StreamServiceLive = Layer.effect(
	StreamService,
	Effect.gen(function* () {
		const runtime = yield* Effect.runtime<PermalinkToStreamState>();

		const permalinkToStreamState = yield* PermalinkToStreamState;

		window.addEventListener("response-stream", ((event: CustomEvent) => {
			Runtime.runSync(
				runtime,
				Effect.gen(function* () {
					yield* Effect.logTrace(`Stream response from ${event.detail.requestUrl}`);

					const streamResponse = yield* decodeStreamResponse(event.detail);

					const entries: { permalink: Permalink; id: string | number; duration: number }[] = [];
					for (const item of streamResponse.data.collection) {
						if (item.track) {
							const permalink = yield* getPermalink(item.track.permalink_url);
							yield* Effect.logTrace(`Found permalink in stream response: ${permalink}`);
							entries.push({ permalink, id: item.track.id.toString(), duration: item.track.duration });
						}
					}

					yield* permalinkToStreamState.setStreamEntries(entries);
				}),
			);
		}) as EventListener);

		window.addEventListener("response-tracks", ((event: CustomEvent) => {
			Runtime.runSync(
				runtime,
				Effect.gen(function* () {
					yield* Effect.logTrace(`Tracks response from ${event.detail.requestUrl}`);

					const tracksResponse = yield* decodeTracksResponse(event.detail);

					const entries: { permalink: Permalink; id: string | number; duration: number }[] = [];
					for (const track of tracksResponse.data.collection) {
						const permalink = yield* getPermalink(track.permalink_url);
						yield* Effect.logTrace(`Found permalink in tracks response: ${permalink}`);
						entries.push({ permalink, id: track.id.toString(), duration: track.duration });
					}

					yield* permalinkToStreamState.setStreamEntries(entries);
				}),
			);
		}) as EventListener);

		yield* Effect.logDebug("Stream service initialized");
	}),
);

const TrackSchema = Schema.Struct({ id: Schema.Number, permalink_url: Schema.String, duration: Schema.Number });

const StreamResponseSchema = Schema.Struct({
	data: Schema.Struct({
		collection: Schema.Array(Schema.Struct({ track: TrackSchema.pipe(Schema.optional) })),
	}),
	requestUrl: Schema.String,
});

const decodeStreamResponse = Schema.decodeUnknown(StreamResponseSchema);

const TracksResponseSchema = Schema.Struct({
	data: Schema.Struct({
		collection: Schema.Array(TrackSchema),
	}),
	requestUrl: Schema.String,
});

const decodeTracksResponse = Schema.decodeUnknown(TracksResponseSchema);
