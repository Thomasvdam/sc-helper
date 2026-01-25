import * as v from "valibot";

const PlaylistResponseSchema = v.object({
	tracks: v.array(
		v.object({
			id: v.number(),
		}),
	),
});

export async function fetchPlaylistTrackIds(clientId: string, playlistId: string) {
	// Use the SC api that their clients use rather than the public one.
	const playlistResponse = await fetch(`https://api-v2.soundcloud.com/playlists/${playlistId}?client_id=${clientId}`);

	const playlistAny = await playlistResponse.json();

	const playlist = v.parse(PlaylistResponseSchema, playlistAny);

	const trackIds: string[] = [];
	for (const track of playlist.tracks) {
		trackIds.push(track.id.toString());
	}

	return new Set(trackIds);
}
