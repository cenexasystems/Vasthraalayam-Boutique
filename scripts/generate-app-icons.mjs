import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const RAW_SRC = path.join(PUBLIC_DIR, 'vasthraalayam-logo-raw.png');

async function main() {
  if (!fs.existsSync(RAW_SRC)) {
    console.error(`Source icon not found at ${RAW_SRC}`);
    process.exit(1);
  }

  console.log(`Processing master boutique logo from: ${RAW_SRC}`);
  const { width: rawW, height: rawH } = await sharp(RAW_SRC).metadata();

  // Background color around edges (deep luxurious forest/emerald green)
  const bg = { r: 18, g: 34, b: 28, alpha: 1 };

  // ── 1. GENERATE MASTER SQUARE LOGO (1024x1024) WITH FULL EMBLEM + TEXT ──
  // The gold emblem + text in RAW_SRC is centered at cx=602, cy=322.5 (w: 740, h: 583)
  // Extract a balanced framing around the logo with natural background texture
  const extractLeft = 190;
  const extractTop = 0;
  const extractW = 824;
  const extractH = 726;

  const extracted = await sharp(RAW_SRC)
    .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
    .toBuffer();

  const feather = 40;
  const rawBuf = await sharp(extracted).ensureAlpha().raw().toBuffer();
  for (let y = 0; y < extractH; y++) {
    for (let x = 0; x < extractW; x++) {
      const distLeft = x;
      const distRight = extractW - 1 - x;
      const distTop = y;
      const distBottom = extractH - 1 - y;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      let alpha = 255;
      if (minDist < feather) {
        alpha = Math.round(255 * (minDist / feather));
      }
      const idx = (y * extractW + x) * 4 + 3;
      rawBuf[idx] = Math.round((rawBuf[idx] * alpha) / 255);
    }
  }

  const feathered = await sharp(rawBuf, { raw: { width: extractW, height: extractH, channels: 4 } }).png().toBuffer();

  const targetW = 930;
  const targetH = Math.round(726 * (targetW / extractW)); // ~820px

  const resized = await sharp(feathered)
    .resize(targetW, targetH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .toBuffer();

  const master1024 = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: bg,
    },
  })
    .composite([
      {
        input: resized,
        left: Math.round((1024 - targetW) / 2),
        top: Math.round((1024 - targetH) / 2),
      },
    ])
    .png()
    .toBuffer();

  await sharp(master1024).jpeg({ quality: 96 }).toFile(path.join(PUBLIC_DIR, 'vasthraalayam-logo.jpeg'));
  await sharp(master1024).png({ quality: 96 }).toFile(path.join(PUBLIC_DIR, 'vasthraalayam-logo.png'));
  console.log('-> Generated vasthraalayam-logo.jpeg & vasthraalayam-logo.png (1024x1024 master)');

  // ── 2. GENERATE EMBLEM ICON (VB + LADY SILHOUETTE IN SAREE) ──
  const cropLeft = 285;
  const cropTop = 110;
  const cropW = 566;
  const cropH = 376;

  const emblemBuf = await sharp(RAW_SRC)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const emblemFeather = 20;
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const distLeft = x;
      const distRight = cropW - 1 - x;
      const distTop = y;
      const distBottom = cropH - 1 - y;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      let alpha = 255;
      if (minDist < emblemFeather) {
        alpha = Math.round(255 * (minDist / emblemFeather));
      }
      const idx = (y * cropW + x) * 4 + 3;
      emblemBuf[idx] = Math.round((emblemBuf[idx] * alpha) / 255);
    }
  }

  const featheredEmblem = await sharp(emblemBuf, { raw: { width: cropW, height: cropH, channels: 4 } }).png().toBuffer();
  const EMBLEM_ASPECT = cropW / cropH;

  async function generateSquareIcon(canvasSize, maxEmblemDim, outputPath) {
    let targetWidth, targetHeight;
    if (EMBLEM_ASPECT >= 1) {
      targetWidth = Math.min(canvasSize - 8, maxEmblemDim);
      targetHeight = Math.round(targetWidth / EMBLEM_ASPECT);
    } else {
      targetHeight = Math.min(canvasSize - 8, maxEmblemDim);
      targetWidth = Math.round(targetHeight * EMBLEM_ASPECT);
    }

    const resizedEmblem = await sharp(featheredEmblem)
      .resize(targetWidth, targetHeight, {
        fit: 'contain',
        kernel: sharp.kernel.lanczos3,
      })
      .toBuffer();

    const left = Math.max(0, Math.round((canvasSize - targetWidth) / 2));
    const top = Math.max(0, Math.round((canvasSize - targetHeight) / 2));

    await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: bg,
      },
    })
      .composite([{ input: resizedEmblem, left, top }])
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`-> Generated ${path.basename(outputPath)} (${canvasSize}x${canvasSize})`);
  }

  // Adaptive Maskable Icons
  await generateSquareIcon(512, 360, path.join(PUBLIC_DIR, 'vasthraalayam-icon-maskable-512.png'));
  await generateSquareIcon(192, 135, path.join(PUBLIC_DIR, 'vasthraalayam-icon-maskable-192.png'));

  // Standard PWA / App Icons
  await generateSquareIcon(512, 420, path.join(PUBLIC_DIR, 'vasthraalayam-icon-512.png'));
  await generateSquareIcon(192, 155, path.join(PUBLIC_DIR, 'vasthraalayam-icon-192.png'));
  await generateSquareIcon(512, 420, path.join(PUBLIC_DIR, 'vasthraalayam-icon.png'));

  // iOS Apple Touch Icon (180x180)
  await generateSquareIcon(180, 130, path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

  // Favicon (64x64)
  await generateSquareIcon(64, 52, path.join(PUBLIC_DIR, 'vasthraalayam-favicon.png'));

  console.log('\nAll Vasthraalayam brand icons generated successfully!');
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
