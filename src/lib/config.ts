import { Context, Data, Effect, LogLevel, Schema } from "effect";

const ConfigSchema = Schema.Struct({
	set_duration_threshold_minutes: Schema.Number,
	playlist_id: Schema.String,
	user_id: Schema.String,
	log_level: Schema.Literal(...LogLevel.allLevels.map((level) => level._tag)),
});

export type Config = typeof ConfigSchema.Type;
const decodeConfig = Schema.decodeUnknown(ConfigSchema);

export const defaultConfig: Config = {
	set_duration_threshold_minutes: 20,
	playlist_id: "806754918", // Public as I'm too lazy to add authentication
	user_id: "109493421",
	log_level: LogLevel.Info._tag,
};

class FailedToGetConfigError extends Data.TaggedError("FailedToGetConfigError")<{ error: unknown }> {}

export const getConfig = () =>
	Effect.gen(function* () {
		const configRaw = yield* Effect.tryPromise({
			try: () => chrome.storage.sync.get(defaultConfig),
			catch: (error) => Effect.fail(new FailedToGetConfigError({ error })),
		});

		const config = yield* decodeConfig(configRaw);

		yield* Effect.logInfo("Loaded config", config);

		return config;
	});

export class ConfigService extends Context.Tag("ConfigService")<ConfigService, Config>() {}
