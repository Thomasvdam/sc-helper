import { Effect, Logger, LogLevel } from "effect";
import { ConfigService, getConfig } from "./lib/config";
import { HighlightSetsServiceLive } from "./lib/highlight-sets-service";
import { PermalinkToStreamStateLive } from "./lib/permalink-to-stream-state";
import { SoundcloudClientServiceLive } from "./lib/soundcloud-client-service";
import { StreamServiceLive } from "./lib/stream-service";
import { TodoPlaylistLive } from "./lib/todo-playlist";

const program = Effect.gen(function* () {}).pipe(
	Effect.provide(HighlightSetsServiceLive),
	Effect.provide(TodoPlaylistLive),
	Effect.provide(StreamServiceLive),
	Effect.provide(SoundcloudClientServiceLive),
	Effect.provide(PermalinkToStreamStateLive),
);

async function run() {
	const config = await Effect.runPromise(getConfig());

	await Effect.runPromise(
		program.pipe(
			Logger.withMinimumLogLevel(LogLevel.fromLiteral(config.log_level)),
			Effect.provideService(ConfigService, config),
		),
	);
}

run();
