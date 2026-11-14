import { createHash } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { platform, arch } from "node:os";
const targets = {
  "darwin-arm64": "macos-aarch64",
  "darwin-x64": "macos-x86-64",
  "linux-x64": "linux-static-x86-64",
  "linux-arm64": "linux-static-aarch64",
};
const target = targets[`${platform()}-${arch()}`];
if (!target)
  throw new Error(
    "Use a supported macOS/Linux machine for the isolated integration harness.",
  );
const release = "v16.5";
const response = await fetch(
  `https://api.github.com/repos/PostgREST/postgrest/releases/tags/${release}`,
);
if (!response.ok) throw new Error(`Release lookup failed: ${response.status}`);
const assets = (await response.json()).assets;
const asset = assets.find(
  (a) => a.name === `postgrest-${release}-${target}.tar.xz`,
);
if (!asset?.digest?.startsWith("sha256:"))
  throw new Error("Release asset has no SHA-256 digest.");
const download = await fetch(asset.browser_download_url);
if (!download.ok) throw new Error(`Download failed: ${download.status}`);
const bytes = Buffer.from(await download.arrayBuffer());
if (
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== asset.digest
)
  throw new Error("PostgREST checksum mismatch.");
await mkdir(".test-cache/bin", { recursive: true });
await writeFile(".test-cache/postgrest.tar.xz", bytes);
execFileSync("tar", [
  "-xf",
  ".test-cache/postgrest.tar.xz",
  "-C",
  ".test-cache/bin",
]);
await chmod(".test-cache/bin/postgrest", 0o755);
console.log("Installed checksum-verified PostgREST for isolated tests.");
