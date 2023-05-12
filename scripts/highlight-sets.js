// Config
const SET_BYTES_THRESHOLD = 150; // Trial and error
const LOADING_TIMEOUT_MS = 300; // Meh
const PLAYLIST_ID = "806754918"; // Public as I'm too lazy to add authentication
const CLIENT_ID = "VDJ3iu7ZYtUMibDTM2XcUbRijDa3L6ug"; // Client ID of the SC web client. Not sure if it ever changes.

// API endpoints
const ENDPOINT_PLAYLIST = (playlistId) =>
  `https://api-v2.soundcloud.com/playlists/${playlistId}?client_id=${CLIENT_ID}`;
const ENDPOINT_TRACKS = (trackIds) => {
  const trackIdsEncoded = encodeURIComponent(trackIds.join(","));
  return `https://api-v2.soundcloud.com/tracks?ids=${trackIdsEncoded}&client_id=${CLIENT_ID}`;
};

// Magic strings
const ATTRIBUTE_SKIPPED = "title"; // Title so it shows on hover. But hacky but it gets the job done.
const SKIPPED_REASON_NO_TRACK = () => "Not a track";
const SKIPPED_REASON_LIKED = () => "Already liked";
const SKIPPED_REASON_IN_PLAYLIST = () => "Already in playlist";
const SKIPPED_REASON_LOW_BYTES = (bytes) =>
  `Bytes too low (${bytes} < ${SET_BYTES_THRESHOLD})`;

// Hacky way to be able to resolve a promise from a different function.
let hackyCallback;
const loadingPlaylistPromise = new Promise((res) => (hackyCallback = res));

// Global mutable state never caused any problems. :)
const state = {
  loadingPlaylistPromise,
  playlist: null,
};

/**
 * Use the SC api that their clients use rather than the public one.
 * As we're limited to the info that's in the DOM for matching we can't use the track IDs. The most robust check for a
 * match seems to be the permalink url...
 * To make it even better the playlist API only returns the permalink url for the first couple of tracks and the ID for
 * the rest, so we need to manually retrieve the extra info for the other tracks...
 */
async function loadPlaylist(playlistId) {
  const playlistResponse = await fetch(ENDPOINT_PLAYLIST(playlistId));
  const playlist = await playlistResponse.json();

  const preloadedPermalinks = [];
  const trackIds = [];
  for (const track of playlist.tracks) {
    if (track.permalink_url) {
      preloadedPermalinks.push(track.permalink_url);
    } else {
      trackIds.push(track.id);
    }
  }

  const additionalPermalinks = await getTracksPermalinks(trackIds);
  const permalinks = preloadedPermalinks.concat(additionalPermalinks);

  state.playlist = new Set(permalinks);

  // Let the rest of the 'app' know we're good to go.
  hackyCallback();
}

async function getTracksPermalinks(trackIds) {
  if (!trackIds.length) {
    return [];
  }
  const tracksResponse = await fetch(ENDPOINT_TRACKS(trackIds));
  const tracks = await tracksResponse.json();

  return tracks.map((track) => track.permalink_url);
}

async function main() {
  const soundListItems = document.querySelectorAll("li.soundList__item");

  if (!soundListItems) {
    return;
  }

  const newSoundListItems = getUnprocessedSoundListItems(soundListItems);
  await state.loadingPlaylistPromise;

  for (const soundListItem of newSoundListItems) {
    if (isPlaylist(soundListItem)) {
      addSkippedReason(soundListItem, SKIPPED_REASON_NO_TRACK());
      continue;
    }

    if (isLiked(soundListItem)) {
      addSkippedReason(soundListItem, SKIPPED_REASON_LIKED());
      continue;
    }

    if (isInPlaylist(soundListItem)) {
      addSkippedReason(soundListItem, SKIPPED_REASON_IN_PLAYLIST());
      continue;
    }

    while (!isWaveformLoaded(soundListItem)) {
      await sleep(LOADING_TIMEOUT_MS);
    }

    const { isSet, setBytes } = getSetStatus(soundListItem);

    if (!isSet) {
      addSkippedReason(soundListItem, SKIPPED_REASON_LOW_BYTES(setBytes));
      continue;
    }

    markSoundListItemAsNewSet(soundListItem);
  }
}

const soundlistItemCache = new Set();
function getUnprocessedSoundListItems(soundListItems) {
  const newSoundListItems = [];

  for (const soundListItem of soundListItems) {
    if (soundlistItemCache.has(soundListItem)) {
      continue;
    }
    newSoundListItems.push(soundListItem);
    soundlistItemCache.add(soundListItem);
  }

  return newSoundListItems;
}

async function sleep(durationMs) {
  return new Promise((res) => setTimeout(res, durationMs));
}

function addSkippedReason(soundListItem, reason) {
  soundListItem.setAttribute(ATTRIBUTE_SKIPPED, reason);
}

function isPlaylist(soundListItem) {
  const playlistElement = soundListItem.querySelector(".playlist");
  return !!playlistElement;
}

function isLiked(soundListItem) {
  const selectedLikeButton = soundListItem.querySelector(
    "button.sc-button-like.sc-button-selected"
  );
  return !!selectedLikeButton;
}

function isInPlaylist(soundListItem) {
  const linkElement = soundListItem.querySelector(
    "div.soundTitle a.sc-link-primary"
  );
  const link = linkElement.href;

  return state.playlist.has(link);
}

function isWaveformLoaded(soundListItem) {
  const waveformContainer = soundListItem.querySelector("div.waveform.loaded");

  return !!waveformContainer;
}

/**
 * Ok this looks horrible, but hear me out. For some reason SC decided it was a good idea to not put the duration of a
 * track in the DOM, they only render it in a canvas. I guess they hate accessibility or they think the length of a
 * track is not important... Anyway, to make an educated guess on the length of a track I take the raw image bytes of a
 * strip on the canvas that's roughly where the a digit would go if a track is longer than 9:59. I then check how many
 * bits are set and based on a trial and error threshold label it as a set.
 * Main downside is that 10 mminute tracks also get labeled, but those are few and far between so I can live with it.
 */
function getSetStatus(soundListItem) {
  const durationCanvas = soundListItem.querySelector(
    "div.waveform__layer.waveform__scene > canvas:nth-child(3)"
  );
  const ctx = durationCanvas.getContext("2d");
  const { width: labelWidthPrecise } = ctx.measureText("11:11");
  const labelWidth = Math.ceil(labelWidthPrecise);
  const { width: charWidthPrecise } = ctx.measureText("1");
  const charWidth = Math.ceil(charWidthPrecise);

  const imageStart = durationCanvas.width - labelWidth;
  const imageData = ctx.getImageData(
    imageStart,
    0,
    charWidth,
    durationCanvas.height
  );

  const setBytes = imageData.data.filter(Boolean).length;

  return {
    isSet: setBytes > SET_BYTES_THRESHOLD,
    setBytes,
  };
}

function markSoundListItemAsNewSet(soundListItem) {
  const statsContainer = soundListItem.querySelector("ul.soundStats");
  const setItem = document.createElement("li");
  setItem.classList.add("sc-ministats-item");
  const icon = document.createElement("span");
  icon.classList.add(
    "sc-ministats",
    "sc-ministats-small",
    "sc-ministats-sounds",
    "sc-text-secondary"
  );
  icon.style.backgroundColor = "#ff5500";
  icon.style.margin = 0;
  icon.style.padding = "6px";
  icon.style.borderRadius = "15px";

  setItem.append(icon);
  statsContainer.append(setItem);
}

// Bootstrap and run on page changes
function addLocationObserver(callback) {
  const config = { attributes: false, childList: true, subtree: true };
  const observer = new MutationObserver(callback);
  observer.observe(document.body, config);
}

addLocationObserver(main);
loadPlaylist(PLAYLIST_ID);
main();
