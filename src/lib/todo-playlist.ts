import { Context, Effect, Layer, MutableHashSet } from "effect";
import { ConfigService } from "./config";
import { type FailedToPutPlaylistError, fetchPlaylistTrackIds, putPlaylist } from "./playlist-api";
import type { SoundcloudClientService } from "./soundcloud-client-service";

export class TodoPlaylist extends Context.Tag("TodoPlaylist")<
	TodoPlaylist,
	{
		isInTodoPlaylist: (id: string) => boolean;
		addToTodoPlaylist: (
			id: string | string[],
		) => Effect.Effect<void, FailedToPutPlaylistError, SoundcloudClientService | ConfigService>;
	}
>() {}

export const TodoPlaylistLive = Layer.effect(
	TodoPlaylist,
	Effect.gen(function* () {
		const config = yield* ConfigService;

		const trackIds = yield* fetchPlaylistTrackIds(config.playlist_id);

		const set = MutableHashSet.fromIterable(trackIds);

		const isInTodoPlaylist = (id: string) => MutableHashSet.has(set, id);

		const size = MutableHashSet.size(set);
		yield* Effect.logDebug(`Todo playlist initialized with ${size} tracks`, set);

		const addToTodoPlaylist = (id: string | string[]) =>
			Effect.gen(function* () {
				const ids = Array.isArray(id) ? id : [id];

				const currentTrackIds = Array.from(set);

				const newTrackIds = [...currentTrackIds, ...ids];

				yield* putPlaylist(config.playlist_id, newTrackIds);

				// Only update the local set if the request is successful
				for (const id of ids) {
					MutableHashSet.add(set, id);
				}
			});

		return { isInTodoPlaylist, addToTodoPlaylist };
	}),
);
