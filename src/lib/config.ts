import { Context, Data, Effect, Layer, Schema } from "effect";

const ConfigSchema = Schema.Struct({
	set_duration_threshold_minutes: Schema.Number,
	playlist_id: Schema.String,
	// TODO: yank from the main world
	client_id: Schema.String,
});

export type Config = typeof ConfigSchema.Type;
const decodeConfig = Schema.decodeUnknown(ConfigSchema);

export const defaultConfig: Config = {
	set_duration_threshold_minutes: 20,
	playlist_id: "806754918", // Public as I'm too lazy to add authentication
	client_id: "LF6OAAOD1pPvKtdzJmuQf6Be2yrcvwCp", // Client ID of the SC web client. This changes every so often...
};

class FailedToGetConfigError extends Data.TaggedError("FailedToGetConfigError")<{ error: unknown }> {}

export const getConfig = () =>
	Effect.gen(function* () {
		const configRaw = yield* Effect.tryPromise({
			try: () => chrome.storage.sync.get(defaultConfig),
			catch: (error) => Effect.fail(new FailedToGetConfigError({ error })),
		});

		return yield* decodeConfig(configRaw);
	});

export class ConfigService extends Context.Tag("ConfigService")<ConfigService, Config>() {}

export const ConfigServiceLive = Layer.effect(
	ConfigService,
	Effect.gen(function* () {
		const config = yield* getConfig();
		yield* Effect.logInfo("Loaded config", config);

		return config;
	}),
);
