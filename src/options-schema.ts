import * as v from "valibot";

export const optionsSchema = v.object({
	set_duration_threshold_minutes: v.number(),
	playlist_id: v.string(),
	client_id: v.string(),
});
export type Options = v.InferOutput<typeof optionsSchema>;

export const defaultOptions: Options = {
	set_duration_threshold_minutes: 20,
	playlist_id: "806754918", // Public as I'm too lazy to add authentication
	client_id: "LF6OAAOD1pPvKtdzJmuQf6Be2yrcvwCp", // Client ID of the SC web client. This changes every so often...
};
