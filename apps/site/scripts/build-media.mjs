import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const mediaDir = path.join(siteRoot, "public", "media");
const outputDir = path.join(mediaDir, "generated");

const files = [
  "maoyisha-lobby",
  "maoyisha-battle-8p",
  "maoyisha-battle-6p",
  "maoyisha-interaction",
  "yuexia-menu",
  "yuexia-battle",
  "yuexia-route",
];

const widths = [480, 960, 1280];

await mkdir(outputDir, { recursive: true });

for (const name of files) {
  const input = path.join(mediaDir, `${name}.webp`);

  await Promise.all([
    ...widths.map((width) =>
      sharp(input)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(outputDir, `${name}-${width}.webp`)),
    ),
    sharp(input)
      .resize({ width: 24, withoutEnlargement: true })
      .blur(8)
      .webp({ quality: 36 })
      .toFile(path.join(outputDir, `${name}-placeholder.webp`)),
  ]);
}

console.log(`Generated responsive media in ${outputDir}`);
