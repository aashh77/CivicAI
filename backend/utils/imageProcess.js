const sharp = require('sharp');

/**
 * Compress an image buffer down to a target size/dimension so it can be
 * safely embedded as base64 inside a Firestore document alongside other
 * issue fields (Firestore hard caps documents at 1 MiB).
 *
 * Strategy: resize to a max dimension, then iteratively reduce JPEG quality
 * until under the target KB budget (or quality floor is hit).
 */
async function compressImageToBase64(buffer, {
  maxDimension = parseInt(process.env.STORED_IMAGE_MAX_DIMENSION || '900', 10),
  maxKB = parseInt(process.env.STORED_IMAGE_MAX_KB || '180', 10),
} = {}) {
  let quality = 80;
  let outputBuffer = await sharp(buffer)
    .rotate() // auto-orient using EXIF before stripping it
    .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();

  while (outputBuffer.length / 1024 > maxKB && quality > 25) {
    quality -= 10;
    outputBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }

  return {
    base64: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
    sizeKB: Math.round(outputBuffer.length / 1024),
    quality,
  };
}

module.exports = { compressImageToBase64 };
