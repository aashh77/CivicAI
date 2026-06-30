const exifr = require('exifr');

/**
 * Attempts to extract GPS coordinates (and capture timestamp) from an
 * uploaded image's EXIF metadata. Many phone photos strip GPS data
 * (e.g. screenshots, downloaded images, social-media re-uploads), so this
 * gracefully returns null when nothing is found instead of throwing -
 * the caller is responsible for handling the "no metadata" case.
 */
async function extractGpsFromImage(buffer) {
  try {
    const gps = await exifr.gps(buffer);
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return null;
    }
    return { lat: gps.latitude, lng: gps.longitude };
  } catch (err) {
    // Corrupt/unsupported EXIF block - treat the same as "no metadata"
    return null;
  }
}

module.exports = { extractGpsFromImage };
