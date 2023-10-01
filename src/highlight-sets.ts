// Config
import { optionsKeys, optionsSchema } from './options-schema';

// Whatever, I know it's ugly. No top level await :(
chrome.storage.sync.get(optionsKeys, (items) => {
  const config = optionsSchema.parse(items);

  // API endpoints
  const ENDPOINT_PLAYLIST = (playlistId: string) =>
    `https://api-v2.soundcloud.com/playlists/${playlistId}?client_id=${config.client_id}`;
  const ENDPOINT_TRACKS = (trackIds: string[]) => {
    const trackIdsEncoded = encodeURIComponent(trackIds.join(','));
    return `https://api-v2.soundcloud.com/tracks?ids=${trackIdsEncoded}&client_id=${config.client_id}`;
  };

  // Magic strings
  const ATTRIBUTE_SKIPPED = 'title'; // Title so it shows on hover. Bit hacky but it gets the job done.
  const SKIPPED_REASON_NO_TRACK = () => 'Not a track';
  const SKIPPED_REASON_LIKED = () => 'Already liked';
  const SKIPPED_REASON_IN_PLAYLIST = () => 'Already in playlist';
  const SKIPPED_REASON_LOW_BYTES = (bytes: number) => `Bytes too low (${bytes} < ${config.set_bytes_threshold})`;

  // Hacky way to be able to resolve a promise from a different function.
  let hackyCallback: () => void;
  const loadingPlaylistPromise = new Promise<void>((res) => (hackyCallback = res));

  // Global mutable state never caused any problems. :)
  const state = {
    loadingPlaylistPromise,
    playlist: new Set([] as string[]),
  };

  /**
   * Use the SC api that their clients use rather than the public one.
   * As we're limited to the info that's in the DOM for matching we can't use the track IDs. The most robust check for a
   * match seems to be the permalink url...
   * To make it even better the playlist API only returns the permalink url for the first couple of tracks and the ID for
   * the rest, so we need to manually retrieve the extra info for the other tracks...
   */
  async function loadPlaylist(playlistId: string) {
    const playlistResponse = await fetch(ENDPOINT_PLAYLIST(playlistId));
    const playlist = await playlistResponse.json();

    const preloadedPermalinks: string[] = [];
    const trackIds: string[] = [];
    for (const track of playlist.tracks) {
      if (track.permalink_url) {
        preloadedPermalinks.push(track.permalink_url);
      } else {
        trackIds.push(track.id);
      }
    }

    const additionalPermalinks = await getTracksPermalinks(trackIds);
    const permalinks: string[] = preloadedPermalinks.concat(additionalPermalinks);

    state.playlist = new Set(permalinks);

    // Let the rest of the 'app' know we're good to go.
    hackyCallback();
  }

  async function getTracksPermalinks(trackIds: string[]) {
    if (!trackIds.length) {
      return [];
    }
    const tracksResponse = await fetch(ENDPOINT_TRACKS(trackIds));
    const tracks: { permalink_url: string }[] = await tracksResponse.json();

    return tracks.map((track) => track.permalink_url);
  }

  async function main() {
    const soundListItems = document.querySelectorAll('li.soundList__item');

    if (!soundListItems) {
      return;
    }

    const soundListItemsArray: Element[] = [];
    soundListItems.forEach((item) => {
      soundListItemsArray.push(item);
    });
    const newSoundListItems = getUnprocessedSoundListItems(soundListItemsArray);
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
        await sleep(config.waveform_polling_interval);
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
  function getUnprocessedSoundListItems(soundListItems: Element[]) {
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

  async function sleep(durationMs: number) {
    return new Promise((res) => setTimeout(res, durationMs));
  }

  function addSkippedReason(soundListItem: Element, reason: string) {
    soundListItem.setAttribute(ATTRIBUTE_SKIPPED, reason);
  }

  function isPlaylist(soundListItem: Element) {
    const playlistElement = soundListItem.querySelector('.playlist');
    return !!playlistElement;
  }

  function isLiked(soundListItem: Element) {
    const selectedLikeButton = soundListItem.querySelector('button.sc-button-like.sc-button-selected');
    return !!selectedLikeButton;
  }

  function isInPlaylist(soundListItem: Element) {
    const linkElement = soundListItem.querySelector<HTMLAnchorElement>('div.soundTitle a.sc-link-primary');

    if (!linkElement) {
      return false;
    }

    const link = linkElement.href;

    return state.playlist.has(link);
  }

  function isWaveformLoaded(soundListItem: Element) {
    const waveformContainer = soundListItem.querySelector('div.waveform.loaded');

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
  function getSetStatus(soundListItem: Element) {
    const durationCanvas = soundListItem.querySelector<HTMLCanvasElement>(
      'div.waveform__layer.waveform__scene > canvas:nth-child(3)',
    );

    if (!durationCanvas) {
      return { isSet: false, setBytes: NaN };
    }

    const ctx = durationCanvas.getContext('2d');

    if (!ctx) {
      return { isSet: false, setBytes: NaN };
    }

    const { width: labelWidthPrecise } = ctx.measureText('11:11');
    const labelWidth = Math.ceil(labelWidthPrecise);
    const { width: charWidthPrecise } = ctx.measureText('1');
    const charWidth = Math.ceil(charWidthPrecise);

    const imageStart = durationCanvas.width - labelWidth;
    const imageData = ctx.getImageData(imageStart, 0, charWidth, durationCanvas.height);

    const setBytes = imageData.data.filter(Boolean).length;

    return {
      isSet: setBytes > config.set_bytes_threshold,
      setBytes,
    };
  }

  function markSoundListItemAsNewSet(soundListItem: Element) {
    const statsContainer = soundListItem.querySelector('ul.soundStats');

    if (!statsContainer) {
      return;
    }

    const setItem = document.createElement('li');
    setItem.classList.add('sc-ministats-item');
    const icon = document.createElement('span');
    icon.classList.add('sc-ministats', 'sc-ministats-small', 'sc-ministats-sounds', 'sc-text-secondary');
    icon.style.backgroundColor = '#ff5500';
    icon.style.margin = '0';
    icon.style.padding = '6px';
    icon.style.borderRadius = '15px';

    setItem.append(icon);
    statsContainer.append(setItem);
  }

  // Bootstrap and run on page changes
  function addLocationObserver(callback: typeof main) {
    const config = { attributes: false, childList: true, subtree: true };
    const observer = new MutationObserver(callback);
    observer.observe(document.body, config);
  }

  addLocationObserver(main);
  loadPlaylist(config.playlist_id);
  main();
});
