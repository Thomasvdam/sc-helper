import { Data, Effect, Redacted, Schema } from "effect";
import { SoundcloudClientService } from "./soundcloud-client-service";

class FailedToFetchPlaylistError extends Data.TaggedError("FailedToFetchPlaylistError")<{ error: unknown }> {}
class FailedToParseJSONError extends Data.TaggedError("FailedToParseJSONError")<{ error: unknown }> {}

const PlaylistResponseSchema = Schema.Struct({
	permalink_url: Schema.String,
	tracks: Schema.Array(
		Schema.Struct({
			id: Schema.Number,
		}),
	),
});

const decodePlaylistResponse = Schema.decodeUnknown(PlaylistResponseSchema);

export const fetchPlaylist = (playlistId: string) =>
	Effect.gen(function* () {
		const clientService = yield* SoundcloudClientService;
		const clientId = yield* clientService.getClientId();

		// Use the SC api that their clients use rather than the public one.
		const playlistResponse = yield* Effect.tryPromise({
			try: () => fetch(`https://api-v2.soundcloud.com/playlists/${playlistId}?client_id=${clientId}`),
			catch: (error) => new FailedToFetchPlaylistError({ error }),
		});

		const playlistAny = yield* Effect.tryPromise({
			try: () => playlistResponse.json(),
			catch: (error) => new FailedToParseJSONError({ error }),
		});

		const playlist = yield* decodePlaylistResponse(playlistAny);
		return playlist;
	});

export const fetchPlaylistTrackIds = (playlistId: string) =>
	Effect.gen(function* () {
		const playlist = yield* fetchPlaylist(playlistId);
		return playlist.tracks.map((track) => track.id.toString());
	});

export class FailedToPutPlaylistError extends Data.TaggedError("FailedToPutPlaylistError")<{ error: unknown }> {}

export const putPlaylist = (playlistId: string, trackIds: string[]) =>
	Effect.gen(function* () {
		const clientService = yield* SoundcloudClientService;
		const clientId = yield* clientService.getClientId();
		const authHeader = yield* clientService.getAuthHeader();
		const datadomeCookie = yield* clientService.getDatadomeCookie();

		const _putResponse = yield* Effect.tryPromise({
			try: () =>
				fetch(`https://api-v2.soundcloud.com/playlists/${playlistId}?client_id=${clientId}`, {
					method: "PUT",
					headers: {
						Authorization: Redacted.value(authHeader),
						"Content-Type": "application/json",
						"x-datadome-clientid": datadomeCookie,
					},
					body: JSON.stringify({
						playlist: {
							tracks: trackIds.map((id) => Number(id)),
						},
					}),
				}),
			catch: (error) => new FailedToPutPlaylistError({ error }),
		});
	});
