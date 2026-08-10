declare const __SOUND_CLOUD_HELPER_BUILD_ID__: string;
declare const __SOUND_CLOUD_HELPER_VERSION__: string;

export const buildInfo = {
	buildId: __SOUND_CLOUD_HELPER_BUILD_ID__,
	version: __SOUND_CLOUD_HELPER_VERSION__,
} as const;
