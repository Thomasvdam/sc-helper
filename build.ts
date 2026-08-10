import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outdir = path.join(__dirname, "dist");
const manifest = (await Bun.file(path.join(__dirname, "manifest.json")).json()) as { version: string };

const gitProcess = Bun.spawn(["git", "rev-parse", "--short=12", "HEAD"], {
	cwd: __dirname,
	stderr: "pipe",
	stdout: "pipe",
});
const [gitOutput, gitError, gitExitCode] = await Promise.all([
	new Response(gitProcess.stdout).text(),
	new Response(gitProcess.stderr).text(),
	gitProcess.exited,
]);

if (gitExitCode !== 0) {
	throw new Error(`Unable to determine build id: ${gitError.trim()}`);
}

const buildId = gitOutput.trim();

const _a = await Bun.build({
	entrypoints: ["src/main.ts", "src/options-ui/index.html", "src/interceptors.ts", "src/background.ts"],
	outdir,
	target: "browser",
	format: "esm",
	sourcemap: true,
	define: {
		__SOUND_CLOUD_HELPER_BUILD_ID__: JSON.stringify(buildId),
		__SOUND_CLOUD_HELPER_VERSION__: JSON.stringify(manifest.version),
	},
});

await fs.cp(path.join(__dirname, "images"), path.join(outdir, "images"), {
	recursive: true,
});

await fs.cp(path.join(__dirname, "manifest.json"), path.join(outdir, "manifest.json"));
