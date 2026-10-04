import { Context, Data, Effect, LogLevel, Schema } from "effect";

const ConfigSchema = Schema.Struct({
	set_duration_threshold_minutes: Schema.Number,
	playlist_id: Schema.String,
	user_id: Schema.String,
	// Keep the stored v3 name so existing settings and the options form remain compatible.
	log_level: Schema.Literals(LogLevel.values.map((level) => (level === "Warn" ? "Warning" : level))),
});

export type Config = typeof ConfigSchema.Type;
const decodeConfig = Schema.decodeUnknownEffect(ConfigSchema);

export const defaultConfig: Config = {
	set_duration_threshold_minutes: 20,
	playlist_id: "806754918", // Public as I'm too lazy to add authentication
	user_id: "109493421",
	log_level: "Info",
};

class FailedToGetConfigError extends Data.TaggedError("FailedToGetConfigError")<{ error: unknown }> {}

export const getConfig = () =>
	Effect.gen(function* () {
		const configRaw = yield* Effect.tryPromise({
			try: () => chrome.storage.sync.get(defaultConfig),
			catch: (error) => new FailedToGetConfigError({ error }),
		});

		const config = yield* decodeConfig(configRaw);

		yield* Effect.logInfo("Loaded config", config);

		return config;
	});

export class ConfigService extends Context.Service<ConfigService, Config>()("ConfigService") {}
