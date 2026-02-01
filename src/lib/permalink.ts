import { Schema } from "effect";

const PermalinkSchema = Schema.String.pipe(Schema.brand("Permalink"));
const decodePermalink = Schema.decode(PermalinkSchema);

export type Permalink = typeof PermalinkSchema.Type;
export const getPermalink = (link: string) => {
	const url = new URL(link);
	return decodePermalink(url.pathname);
};
