import { Context, Effect, Layer, MutableHashMap, Option, Schema } from "effect";
import type { Permalink } from "./permalink";

const StreamEntry = Schema.Struct({
	id: Schema.String,
	duration: Schema.Number,
});
type StreamEntry = typeof StreamEntry.Type;

export class PermalinkToStreamState extends Context.Tag("PermalinkToStreamState")<
	PermalinkToStreamState,
	{
		getStreamEntry: (permalink: Permalink) => Effect.Effect<StreamEntry>;
		setStreamEntries: (
			entries: { permalink: Permalink; id: string | number; duration: number }[],
		) => Effect.Effect<void>;
	}
>() {}

export const PermalinkToStreamStateLive = Layer.effect(
	PermalinkToStreamState,
	Effect.gen(function* () {
		const map = MutableHashMap.empty<Permalink, StreamEntry>();
		const streamUpdated = yield* Effect.makeLatch();
		const mutex = yield* Effect.makeSemaphore(1);

		const getStreamEntry = (permalink: Permalink, depth = 0): Effect.Effect<StreamEntry> =>
			Effect.gen(function* () {
				const entry = MutableHashMap.get(map, permalink);

				if (Option.isNone(entry)) {
					if (depth > 10) {
						return yield* Effect.die(new Error(`Stream entry not found after ${depth} attempts`));
					}
					// Wait for the stream to be updated and retry
					yield* streamUpdated.close;

					return yield* getStreamEntry(permalink, depth + 1).pipe(streamUpdated.whenOpen);
				}

				return entry.value;
			});

		const setStreamEntries = (entries: { permalink: Permalink; id: string | number; duration: number }[]) =>
			// Ensure the state is updated atomically
			mutex.withPermits(1)(
				Effect.gen(function* () {
					for (const entry of entries) {
						MutableHashMap.set(map, entry.permalink, {
							id: entry.id,
							duration: entry.duration,
						});
					}

					// Open the latch to signal that the stream has been updated
					yield* streamUpdated.open;
					return;
				}),
			);

		return {
			getStreamEntry,
			setStreamEntries,
		};
	}),
);
