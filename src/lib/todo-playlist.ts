import { Context, Effect, Layer, MutableHashSet } from "effect";
import { ConfigService } from "./config";
import { type FailedToPutPlaylistError, fetchPlaylist, fetchPlaylistTrackIds, putPlaylist } from "./playlist-api";
import type { SoundcloudClientService } from "./soundcloud-client-service";
import { TrackLikesService } from "./track-likes-service";

export class TodoPlaylist extends Context.Tag("TodoPlaylist")<
	TodoPlaylist,
	{
		getPermalinkUrl: () => string;
		isInTodoPlaylist: (id: string) => boolean;
		addToTodoPlaylist: (
			id: string | string[],
		) => Effect.Effect<void, FailedToPutPlaylistError, SoundcloudClientService | ConfigService>;
		cleanUpLikedTracks: () => Effect.Effect<
			{ removedCount: number; remainingCount: number },
			unknown,
			SoundcloudClientService | ConfigService | TrackLikesService
		>;
	}
>() {}

export const TodoPlaylistLive = Layer.effect(
	TodoPlaylist,
	Effect.gen(function* () {
		const config = yield* ConfigService;
		const trackLikesService = yield* TrackLikesService;

		const playlist = yield* fetchPlaylist(config.playlist_id);
		const trackIds = playlist.tracks.map((track) => track.id.toString());
		const permalinkUrl = playlist.permalink_url;

		const set = MutableHashSet.fromIterable(trackIds);

		const isInTodoPlaylist = (id: string) => MutableHashSet.has(set, id);

		const size = MutableHashSet.size(set);
		yield* Effect.logDebug("Todo playlist initialized", { permalinkUrl, trackCount: size });

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

		const cleanUpLikedTracks = () =>
			Effect.gen(function* () {
				// Fetch the playlist again so cleanup operates on the current remote list,
				// rather than only on the snapshot used during initialization.
				const currentTrackIds = yield* fetchPlaylistTrackIds(config.playlist_id);
				const remainingTrackIds: string[] = [];

				for (const id of currentTrackIds) {
					if (!(yield* trackLikesService.isLiked(id))) {
						remainingTrackIds.push(id);
					}
				}

				yield* putPlaylist(config.playlist_id, remainingTrackIds);

				// Only update the local set if the request is successful.
				MutableHashSet.clear(set);
				for (const id of remainingTrackIds) {
					MutableHashSet.add(set, id);
				}

				return {
					removedCount: currentTrackIds.length - remainingTrackIds.length,
					remainingCount: remainingTrackIds.length,
				};
			});

		return { getPermalinkUrl: () => permalinkUrl, isInTodoPlaylist, addToTodoPlaylist, cleanUpLikedTracks };
	}),
);
