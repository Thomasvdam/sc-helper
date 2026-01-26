import { Context, Effect, Layer, MutableHashSet } from "effect";
import { ConfigService } from "./config";
import { fetchPlaylistTrackIds } from "./fetch-playlist";

export class TodoPlaylist extends Context.Tag("TodoPlaylist")<
	TodoPlaylist,
	{
		isInTodoPlaylist: (id: string) => boolean;
	}
>() {}

export const TodoPlaylistLive = Layer.effect(
	TodoPlaylist,
	Effect.gen(function* () {
		const config = yield* ConfigService;

		const trackIds = yield* fetchPlaylistTrackIds(config.client_id, config.playlist_id);

		const set = MutableHashSet.fromIterable(trackIds);

		const isInTodoPlaylist = (id: string) => MutableHashSet.has(set, id);

		const size = MutableHashSet.size(set);
		yield* Effect.logDebug(`Todo playlist initialized with ${size} tracks`, set);

		return { isInTodoPlaylist };
	}),
);
