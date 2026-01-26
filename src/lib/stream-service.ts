import { Context, Effect, Layer, Runtime, Schema } from "effect";
import { getPermalink, type Permalink } from "./permalink";
import { PermalinkToStreamState } from "./permalink-to-stream-state";

export class StreamService extends Context.Tag("StreamService")<StreamService, void>() {}

export const StreamServiceLive = Layer.effect(
	StreamService,
	Effect.gen(function* () {
		const runtime = yield* Effect.runtime<PermalinkToStreamState>();

		const permalinkToStreamState = yield* PermalinkToStreamState;

		window.addEventListener("streamResponse", ((event: CustomEvent) => {
			Runtime.runSync(
				runtime,
				Effect.gen(function* () {
					const streamResponse = yield* decodeStreamResponse(event.detail);

					const entries: { permalink: Permalink; id: string | number; duration: number }[] = [];
					for (const item of streamResponse.collection) {
						if (item.track) {
							const permalink = yield* getPermalink(item.track.permalink_url);
							entries.push({ permalink, id: item.track.id.toString(), duration: item.track.duration });
						}
					}

					yield* permalinkToStreamState.setStreamEntries(entries);
				}),
			);
		}) as EventListener);

		yield* Effect.logDebug("Stream service initialized");
	}),
);

const StreamResponseSchema = Schema.Struct({
	collection: Schema.Array(
		Schema.Struct({
			track: Schema.Struct({ id: Schema.Number, permalink_url: Schema.String, duration: Schema.Number }).pipe(
				Schema.optional,
			),
		}),
	),
});

const decodeStreamResponse = Schema.decodeUnknown(StreamResponseSchema);
