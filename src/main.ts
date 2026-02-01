import { Effect, Logger, LogLevel } from "effect";
import { ClientIdServiceLive } from "./lib/client-id-service";
import { ConfigServiceLive } from "./lib/config";
import { HighlightSetsServiceLive } from "./lib/highlight-sets-service";
import { PermalinkToStreamStateLive } from "./lib/permalink-to-stream-state";
import { StreamServiceLive } from "./lib/stream-service";
import { TodoPlaylistLive } from "./lib/todo-playlist";

const program = Effect.gen(function* () {}).pipe(
	Effect.provide(HighlightSetsServiceLive),
	Effect.provide(TodoPlaylistLive),
	Effect.provide(ConfigServiceLive),
	Effect.provide(StreamServiceLive),
	Effect.provide(ClientIdServiceLive),
	Effect.provide(PermalinkToStreamStateLive),
	Logger.withMinimumLogLevel(LogLevel.Trace),
);

Effect.runPromise(program);
