import { Data, Effect, Schema } from "effect";

class FailedToFetchPlaylistError extends Data.TaggedError("FailedToFetchPlaylistError")<{ error: unknown }> {}
class FailedToParseJSONError extends Data.TaggedError("FailedToParseJSONError")<{ error: unknown }> {}

const PlaylistResponseSchema = Schema.Struct({
	tracks: Schema.Array(
		Schema.Struct({
			id: Schema.Number,
		}),
	),
});

const decodePlaylistResponse = Schema.decodeUnknown(PlaylistResponseSchema);

export const fetchPlaylistTrackIds = (clientId: string, playlistId: string) =>
	Effect.gen(function* () {
		// Use the SC api that their clients use rather than the public one.
		const playlistResponse = yield* Effect.tryPromise({
			try: () => fetch(`https://api-v2.soundcloud.com/playlists/${playlistId}?client_id=${clientId}`),
			catch: (error) => Effect.fail(new FailedToFetchPlaylistError({ error })),
		});

		const playlistAny = yield* Effect.tryPromise({
			try: () => playlistResponse.json(),
			catch: (error) => Effect.fail(new FailedToParseJSONError({ error })),
		});

		const playlist = yield* decodePlaylistResponse(playlistAny);

		const trackIds: string[] = [];
		for (const track of playlist.tracks) {
			trackIds.push(track.id.toString());
		}

		return trackIds;
	});
