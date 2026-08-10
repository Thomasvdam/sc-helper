# Repository guide

SoundCloud Helper is a personal Chrome Manifest V3 extension built with Bun, TypeScript, and Effect. It observes SoundCloud's private API traffic, tracks likes and playlist state, and augments track-list rows. Keep changes small: the extension depends on SoundCloud's current DOM and undocumented API shapes.

## Where to look

- `manifest.json`: extension entrypoints, permissions, and execution worlds.
- `build.ts`: bundles the three entrypoints and copies the manifest/images to ignored `dist/`.
- `src/interceptors.ts`: MAIN-world XHR/navigation interception. This is the only code with direct access to SoundCloud's page-world requests.
- `src/main.ts`: isolated content-script composition root; provides all Effect layers and configuration.
- `src/lib/soundcloud-client-service.ts`: captures client ID, authorization, and Datadome values.
- `src/lib/stream-service.ts` and `permalink-to-stream-state.ts`: decode intercepted responses and map permalinks to track metadata.
- `src/lib/track-likes-service.ts`: accumulates the signed-in user's liked-track IDs.
- `src/lib/playlist-api.ts` and `todo-playlist.ts`: read and update the configured playlist.
- `src/lib/highlight-sets-service.ts`: scans SoundCloud's DOM, marks skipped items, and adds playlist buttons.
- `src/lib/loading-state.ts`: readiness/utility overlay injected into the page.
- `src/lib/config.ts` and `src/options-ui/`: synced extension settings and their options form.

## Architecture constraints

- MAIN-world and isolated content-script code communicate through `window` `CustomEvent`s. If an event name or payload changes, update its producer in `interceptors.ts` and every consumer together.
- Add page-network interception and endpoint classification in `interceptors.ts`; decode untrusted payloads with Effect `Schema` in the consuming service.
- Keep Effect dependencies explicit with `Context.Tag` and `Layer`. Wire every new live layer in `src/main.ts`, respecting dependencies between layers.
- SoundCloud data can arrive after DOM nodes. Preserve the latch/queue-based coordination rather than assuming initialization order.
- Normalize track IDs to strings in in-memory sets. Only convert to numbers at the SoundCloud playlist request boundary.
- Treat auth headers and similar credentials as secrets; keep them redacted and never add credential logging.
- Configuration keys must stay aligned across `ConfigSchema`, `defaultConfig`, and matching element IDs in `src/options-ui/index.html`.
- DOM selectors and private API schemas are fragile integration points. Avoid broad rewrites and handle missing or changed page data defensively.

## Development workflow

Use Bun and keep `bun.lock` in sync when dependencies change.

```sh
bun install
bun run dev       # rebuild on source changes
bun run lint      # Biome check
bun run fmt       # Biome check with safe writes
bun run build     # emits the unpacked extension to dist/
```

There is currently no automated test suite. Before handing off a change, run `bun run lint` and `bun run build`. For behavior changes, load/reload `dist/` as an unpacked Chrome extension, reload a SoundCloud tab, and manually exercise the affected flow. Check both the page console and extension options when relevant; a successful build alone does not validate SoundCloud DOM selectors, intercepted events, authentication, or API writes.

## Change hygiene

- Follow the existing TypeScript/Effect style and let Biome format code; do not edit generated `dist/` or vendored `node_modules/`.
- Preserve unrelated worktree changes.
- Always increment `manifest.json`'s `version` for implementation or behavior changes, in the same change as the implementation. Use SemVer (`MAJOR.MINOR.PATCH`): increment PATCH for backwards-compatible fixes and internal changes, MINOR for backwards-compatible features, and MAJOR for breaking behavior or compatibility changes. Documentation-only and formatting-only changes do not require a version bump.
- Update `manifest.json` when adding an entrypoint, permission, host, or extension asset; update `build.ts` when the new asset also needs copying or bundling.
- Playlist updates are remote, destructive operations. Keep local state updates after successful requests and manually verify both addition and removal behavior.
- Finish an implementation task with a scoped diff, automated validation, and a conventional commit.
- Keep the final report compact: outcome, validation summary, artifact path, pending manual checks, and commit ID.
