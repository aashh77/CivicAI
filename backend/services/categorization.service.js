const { DEPARTMENTS } = require('../config/constants');

// Keyword dictionary mapping descriptive narrative text elements -> internal civic issue categories.
const CATEGORY_KEYWORDS = {
  pothole: ['pothole', 'road damage', 'asphalt', 'crack', 'road surface', 'pavement', 'tarmac'],
  road_damage: ['road', 'highway', 'street', 'pavement', 'sidewalk', 'curb'],
  water_leakage: ['water', 'leak', 'pipe', 'flood', 'puddle', 'sewage', 'drain', 'manhole'],
  drainage: ['drain', 'gutter', 'sewer', 'stormwater', 'culvert'],
  streetlight: ['streetlight', 'street light', 'lamp post', 'lamppost', 'light fixture', 'pole', 'lighting'],
  electrical_hazard: ['wire', 'cable', 'electric', 'transformer', 'power line', 'electrical'],
  waste_management: ['trash', 'garbage', 'waste', 'litter', 'dump', 'rubbish', 'debris', 'landfill'],
  garbage: ['garbage bin', 'trash can', 'dumpster', 'waste container'],
  infrastructure: ['building', 'wall', 'fence', 'bridge', 'construction', 'public', 'infrastructure'],
};

const CATEGORY_LABELS = {
  pothole: 'Pothole',
  road_damage: 'Road Damage',
  water_leakage: 'Water Leakage',
  drainage: 'Drainage Issue',
  streetlight: 'Damaged Streetlight',
  electrical_hazard: 'Electrical Hazard',
  waste_management: 'Waste Management',
  garbage: 'Overflowing Garbage',
  infrastructure: 'Public Infrastructure Damage',
  other: 'Other / Uncategorized',
};

/**
 * Scans a consolidated text string against the keyword dictionary matrices.
 */
function scoreTextBlob(analysisText = '') {
  const normalizedText = analysisText.toLowerCase();
  const categoryScores = {};

  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    categoryScores[category] = 0;
  }

  // Iterate over matching sets; boost weight proportionally if keyword appears
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (normalizedText.includes(kw)) {
        // Base uniform score weight per matching keyword hit
        categoryScores[category] += 0.8; 
      }
    }
  }

  return categoryScores;
}

/**
 * Determines the best-fit civic category from combined textual data and AI visual analysis reasons.
 * Refactored to accept title, description, and the visual verification reasoning.
 * 
 * @param {string} title - The citizen's issue title
 * @param {string} description - The citizen's issue description
 * @param {string} aiReason - The visual feedback explanation returned from Gemini
 */
function categorizeIssue(title = '', description = '', aiReason = '') {
  // 1. Consolidate human entry strings and machine narrative analysis into a searchable text block
  const blendedText = `${title} ${description} ${aiReason}`;
  
  // 2. Score text metadata
  const scores = scoreTextBlob(blendedText);
  let bestCategory = 'other';
  let bestScore = 0;

  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Normalize confidence (0-1). If nothing matched, assign low confidence fallback
  const confidence = bestScore > 0 ? Math.min(1, bestScore / 2) : 0.40;

  // Find department mapping via existing collection patterns
  const department =
    DEPARTMENTS.find((d) => d.categories.includes(bestCategory)) ||
    DEPARTMENTS.find((d) => d.id === 'public_works');

  return {
    category: bestCategory,
    categoryLabel: CATEGORY_LABELS[bestCategory] || 'Other',
    confidence: Number(confidence.toFixed(2)),
    departmentId: department ? department.id : 'public_works',
    departmentName: department ? department.name : 'Public Works',
  };
}

module.exports = { categorizeIssue, CATEGORY_LABELS };