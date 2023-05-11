// Config
const SET_BYTES_THRESHOLD = 150; // Trial and error
const LOADING_TIMEOUT_MS = 300; // Meh
const PLAYLIST_ID = "806754918"; // Public as I'm too lazy to add authentication

let hackyCallback;
const loadingPlaylistPromise = new Promise((res) => (hackyCallback = res));
const state = {
  loadingPlaylistPromise,
  playlist: null,
};

async function loadPlaylist(playlistId) {
  const playlistResponse = await fetch(
    `https://api-v2.soundcloud.com/playlists/${playlistId}?client_id=VDJ3iu7ZYtUMibDTM2XcUbRijDa3L6ug`
  );
  const playlist = await playlistResponse.json();

  const trackIds = playlist.tracks.map((track) => track.id).join(",");
  const trackIdsEncoded = encodeURIComponent(trackIds);
  const tracksResponse = await fetch(
    `https://api-v2.soundcloud.com/tracks?ids=${trackIdsEncoded}&client_id=VDJ3iu7ZYtUMibDTM2XcUbRijDa3L6ug`
  );
  const tracks = await tracksResponse.json();

  const relativePermalinks = tracks.map((track) => track.permalink_url);
  state.playlist = new Set(relativePermalinks);
  hackyCallback();
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
      continue;
    }

    if (isInPlaylist(soundListItem)) {
        continue;
    }

    if (isLiked(soundListItem)) {
      continue;
    }

    while (!isWaveformLoaded(soundListItem)) {
      await sleep(LOADING_TIMEOUT_MS);
    }

    const { isSet, setBytes } = getSetStatus(soundListItem);
    soundListItem.setAttribute("set-bytes", `${setBytes}`);

    if (!isSet) {
      continue;
    }

    markSoundListItemAsSet(soundListItem);
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
  const linkElement = soundListItem.querySelector("div.soundTitle a.sc-link-primary");
  const link = linkElement.href;

  return state.playlist.has(link);
}

function isWaveformLoaded(soundListItem) {
  const waveformContainer = soundListItem.querySelector("div.waveform.loaded");

  return !!waveformContainer;
}

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

function markSoundListItemAsSet(soundListItem) {
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
