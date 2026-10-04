import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { Effect, Exit, Fiber, Latch, Logger, Redacted, References } from "effect";
import { ConfigService, defaultConfig, getConfig } from "../src/lib/config";
import { HighlightSetsService, HighlightSetsServiceLive } from "../src/lib/highlight-sets-service";
import { getPermalink } from "../src/lib/permalink";
import { PermalinkToStreamState, PermalinkToStreamStateLive } from "../src/lib/permalink-to-stream-state";
import { SoundcloudClientService, SoundcloudClientServiceLive } from "../src/lib/soundcloud-client-service";
import { StreamService, StreamServiceLive } from "../src/lib/stream-service";
import { TodoPlaylist, TodoPlaylistLive } from "../src/lib/todo-playlist";
import { TrackLikesService, TrackLikesServiceLive } from "../src/lib/track-likes-service";

const originalGlobals = new Map(
	["window", "chrome", "fetch", "document", "MutationObserver"].map((key) => [
		key,
		Object.getOwnPropertyDescriptor(globalThis, key),
	]),
);

const clientStub = {
	getClientId: () => Effect.succeed("test-client"),
	getAuthHeader: () => Effect.succeed(Redacted.make("test-authorization")),
	getDatadomeCookie: () => Effect.succeed("test-cookie"),
};

beforeEach(() => {
	Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
	Object.defineProperty(globalThis, "chrome", {
		configurable: true,
		value: {
			storage: { sync: { get: mock(async () => ({ ...defaultConfig })) } },
			runtime: {
				sendMessage: (_request: unknown, callback: (response: { datadomeCookie: string | null }) => void) =>
					callback({ datadomeCookie: null }),
			},
		},
	});
});

afterEach(() => {
	mock.restore();
	for (const [key, descriptor] of originalGlobals) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		else Reflect.deleteProperty(globalThis, key);
	}
});

const quiet = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	effect.pipe(Effect.provideService(References.MinimumLogLevel, "None"), Effect.timeout("1 second"));

const dispatch = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

test("stored log levels, including Warning, retain their options-form values", async () => {
	for (const log_level of ["None", "Fatal", "Error", "Warning", "Info", "Debug", "Trace", "All"]) {
		spyOn(chrome.storage.sync, "get").mockResolvedValueOnce({ ...defaultConfig, log_level });
		expect((await Effect.runPromise(quiet(getConfig()))).log_level).toBe(log_level);
	}
});

test("storage and schema failures remain typed Effect errors", async () => {
	const error = new Error("Storage unavailable");
	spyOn(chrome.storage.sync, "get").mockRejectedValueOnce(error);
	await expect(Effect.runPromise(quiet(getConfig()))).rejects.toMatchObject({
		_tag: "FailedToGetConfigError",
		error,
	});
	spyOn(chrome.storage.sync, "get").mockResolvedValueOnce({ ...defaultConfig, log_level: "invalid" });
	await expect(Effect.runPromise(quiet(getConfig()))).rejects.toMatchObject({ _tag: "SchemaError" });
});

test("liked-track lookups wait for all pages and read the final string-normalized set", async () => {
	await Effect.runPromise(
		Effect.gen(function* () {
			const likes = yield* TrackLikesService;
			const pending = yield* Effect.forkChild(likes.isLiked(42), { startImmediately: true });
			dispatch("response-track_likes", {
				requestUrl: "https://api-v2.soundcloud.com/users/test/track_likes/ids",
				data: { collection: [42], next_href: "https://api-v2.soundcloud.com/next", query_urn: null },
			});
			expect(likes.likesAvailable.isOpen()).toBe(false);
			expect(pending.pollUnsafe()).toBeUndefined();
			dispatch("response-track_likes", {
				requestUrl: "https://api-v2.soundcloud.com/next",
				data: { collection: [43], next_href: null, query_urn: null },
			});
			expect(yield* Fiber.join(pending)).toBe(true);
			expect(yield* likes.isLiked("43")).toBe(true);
			expect(yield* likes.isLiked("missing")).toBe(false);
		}).pipe(Effect.provide(TrackLikesServiceLive), quiet),
	);
});

test("page-world callbacks retain logging settings and release credential waits", async () => {
	const messages: unknown[] = [];
	const logger = Logger.make(({ message }) => messages.push(message));
	await Effect.runPromise(
		Effect.gen(function* () {
			const client = yield* SoundcloudClientService;
			const pending = yield* Effect.forkChild(
				Effect.all([client.getClientId(), client.getAuthHeader(), client.getDatadomeCookie()], {
					concurrency: "unbounded",
				}),
				{ startImmediately: true },
			);
			dispatch("soundcloud-client-id", "test-client");
			dispatch("soundcloud-auth-header", "test-authorization");
			expect(pending.pollUnsafe()).toBeUndefined();
			dispatch("soundcloud-datadome-cookie", "test-cookie");
			const [clientId, authorization, cookie] = yield* Fiber.join(pending);
			expect(clientId).toBe("test-client");
			expect(Redacted.isRedacted(authorization)).toBe(true);
			expect(Redacted.value(authorization)).toBe("test-authorization");
			expect(cookie).toBe("test-cookie");
			expect(messages).toEqual([]);
			yield* Effect.logError("visible");
			expect(messages).toEqual([["visible"]]);
		}).pipe(
			Effect.provide(SoundcloudClientServiceLive),
			Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
			Effect.provideService(References.MinimumLogLevel, "Error"),
			Effect.timeout("1 second"),
		),
	);
});

test("the extension cookie callback can satisfy readiness without a page cookie event", async () => {
	spyOn(chrome.runtime, "sendMessage").mockImplementation((_request, callback) => {
		queueMicrotask(() => callback({ datadomeCookie: "test-extension-cookie" }));
	});
	const cookie = await Effect.runPromise(
		Effect.gen(function* () {
			const client = yield* SoundcloudClientService;
			return yield* client.getDatadomeCookie();
		}).pipe(Effect.provide(SoundcloudClientServiceLive), quiet),
	);
	expect(cookie).toBe("test-extension-cookie");
});

test("stream and track events decode optional items and satisfy late metadata waits", async () => {
	await Effect.runPromise(
		Effect.gen(function* () {
			yield* StreamService;
			const state = yield* PermalinkToStreamState;
			const permalink = yield* getPermalink("https://soundcloud.com/test/first");
			const pending = yield* Effect.forkChild(state.getStreamEntry(permalink), { startImmediately: true });
			expect(pending.pollUnsafe()).toBeUndefined();
			dispatch("response-stream", {
				requestUrl: "https://api-v2.soundcloud.com/stream",
				data: {
					collection: [{}, { track: { id: 42, permalink_url: "https://soundcloud.com/test/first", duration: 1200 } }],
				},
			});
			expect(yield* Fiber.join(pending)).toEqual({ id: "42", duration: 1200 });
			dispatch("response-tracks", {
				requestUrl: "https://api-v2.soundcloud.com/tracks",
				data: { collection: [{ id: 43, permalink_url: "https://soundcloud.com/test/second", duration: 2400 }] },
			});
			const second = yield* getPermalink("https://soundcloud.com/test/second");
			expect(yield* state.getStreamEntry(second)).toEqual({ id: "43", duration: 2400 });
			yield* state.setStreamEntries([{ permalink: second, id: 44, duration: 3600 }]);
			expect(yield* state.getStreamEntry(second)).toEqual({ id: "44", duration: 3600 });
		}).pipe(Effect.provide(StreamServiceLive), Effect.provide(PermalinkToStreamStateLive), quiet),
	);
});

test("DOM scans track distinct nodes by identity without traversing their properties", async () => {
	let processedCount = 0;
	let finishProcessing = () => {};
	const processed = new Promise<void>((resolve) => {
		finishProcessing = resolve;
	});
	const makeItem = () => {
		const item = {
			querySelector: (selector: string) =>
				selector === ".playlist" ? {} : { href: "https://soundcloud.com/test/sets/source" },
			style: {},
			setAttribute: () => {
				processedCount += 1;
				if (processedCount === 2) finishProcessing();
			},
		};
		Object.defineProperty(item, "ownerDocument", {
			enumerable: true,
			get: () => {
				throw new Error("DOM properties must not be traversed when tracking node identity");
			},
		});
		return item;
	};
	const items = [makeItem(), makeItem()];
	let scanAgain = () => {};
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: { body: {}, querySelectorAll: () => items },
	});
	Object.defineProperty(globalThis, "MutationObserver", {
		configurable: true,
		value: class {
			constructor(callback: () => void) {
				scanAgain = callback;
			}
			observe() {}
		},
	});
	await Effect.runPromise(
		Effect.gen(function* () {
			yield* HighlightSetsService;
			yield* Effect.promise(() => processed);
			scanAgain();
			yield* Effect.yieldNow;
			expect(processedCount).toBe(2);
		}).pipe(
			Effect.provide(HighlightSetsServiceLive),
			Effect.provideService(ConfigService, defaultConfig),
			Effect.provideService(SoundcloudClientService, clientStub),
			Effect.provideService(PermalinkToStreamState, {
				getStreamEntry: () => Effect.die("Playlist rows should not wait for track metadata"),
				setStreamEntries: () => Effect.void,
			}),
			Effect.provideService(TrackLikesService, {
				isLiked: () => Effect.succeed(false),
				likesAvailable: Latch.makeUnsafe(true),
			}),
			Effect.provideService(TodoPlaylist, {
				getPermalinkUrl: () => "https://soundcloud.com/test/sets/todo",
				isInTodoPlaylist: () => false,
				addToTodoPlaylist: () => Effect.void,
				cleanUpLikedTracks: () => Effect.succeed({ removedCount: 0, remainingCount: 0 }),
				copyUnlikedTracksFromPlaylist: () =>
					Effect.succeed({ sourceCount: 0, likedCount: 0, alreadyInTodoCount: 0, addedCount: 0 }),
			}),
			quiet,
		),
	);
});

test("playlist addition and cleanup change local state only after successful writes", async () => {
	let remoteIds = [1];
	let rejectNextWrite = true;
	const writes: number[][] = [];
	spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
		if (init?.method === "PUT") {
			if (rejectNextWrite) {
				rejectNextWrite = false;
				throw new Error("Write failed");
			}
			remoteIds = JSON.parse(String(init.body)).playlist.tracks;
			writes.push([...remoteIds]);
			return new Response(null, { status: 204 });
		}
		return Response.json({
			permalink_url: "https://soundcloud.com/test/sets/todo",
			tracks: remoteIds.map((id) => ({ id })),
		});
	});
	await Effect.runPromise(
		Effect.gen(function* () {
			const playlist = yield* TodoPlaylist;
			expect(playlist.isInTodoPlaylist("1")).toBe(true);
			expect(Exit.isFailure(yield* Effect.exit(playlist.addToTodoPlaylist("2")))).toBe(true);
			expect(playlist.isInTodoPlaylist("2")).toBe(false);
			yield* playlist.addToTodoPlaylist("2");
			expect(playlist.isInTodoPlaylist("2")).toBe(true);
			rejectNextWrite = true;
			expect(Exit.isFailure(yield* Effect.exit(playlist.cleanUpLikedTracks()))).toBe(true);
			expect(playlist.isInTodoPlaylist("1")).toBe(true);
			expect(yield* playlist.cleanUpLikedTracks()).toEqual({ removedCount: 1, remainingCount: 1 });
			expect(playlist.isInTodoPlaylist("1")).toBe(false);
			expect(playlist.isInTodoPlaylist("2")).toBe(true);
		}).pipe(
			Effect.provide(TodoPlaylistLive),
			Effect.provideService(ConfigService, defaultConfig),
			Effect.provideService(SoundcloudClientService, clientStub),
			Effect.provideService(TrackLikesService, {
				isLiked: (id) => Effect.succeed(String(id) === "1"),
				likesAvailable: Latch.makeUnsafe(true),
			}),
			quiet,
		),
	);
	expect(writes).toEqual([[1, 2], [2]]);
});
