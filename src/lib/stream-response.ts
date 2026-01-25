import * as v from "valibot";

export const StreamResponseSchema = v.object({
	collection: v.array(
		v.object({
			track: v.optional(
				v.object({
					id: v.number(),
					permalink_url: v.string(),
					duration: v.number(),
				}),
			),
		}),
	),
});
