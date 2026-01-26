import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outdir = path.join(__dirname, "dist");

const _a = await Bun.build({
	entrypoints: ["src/main.ts", "src/options-ui/index.html", "src/interceptors.ts"],
	outdir,
	target: "browser",
	format: "esm",
	sourcemap: true,
});

await fs.cp(path.join(__dirname, "images"), path.join(outdir, "images"), {
	recursive: true,
});

await fs.cp(path.join(__dirname, "manifest.json"), path.join(outdir, "manifest.json"));
