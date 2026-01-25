export type Permalink = string;
export function getPermalink(link: string) {
	return link.replace("https://soundcloud.com/", "") as Permalink;
}
