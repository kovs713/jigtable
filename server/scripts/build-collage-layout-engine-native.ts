import { $ } from "bun"
import { copyFile } from "node:fs/promises"
import { join } from "node:path"

const release = process.argv.includes("--release")
const profile = release ? "release" : "debug"
const manifestPath = join("native", "collage-layout-engine", "Cargo.toml")
const source = join(
  "native",
  "collage-layout-engine",
  "target",
  profile,
  nativeLibraryFileName("collage_layout_engine_native")
)
const target = join(
  "src",
  "collage-layout-engine",
  "collage_layout_engine_native.node"
)

if (release) {
  await $`cargo build --manifest-path ${manifestPath} --release`
} else {
  await $`cargo build --manifest-path ${manifestPath}`
}

await copyFile(source, target)
console.log(`built ${target}`)

function nativeLibraryFileName(name: string): string {
  if (process.platform === "win32") {
    return `${name}.dll`
  }

  if (process.platform === "darwin") {
    return `lib${name}.dylib`
  }

  return `lib${name}.so`
}
