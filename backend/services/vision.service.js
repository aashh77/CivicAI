const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function analyzeImage(buffer, title = '', description = '') {
  try {
    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: 'image/jpeg',
      },
    };

    const promptText = `
      You are an AI civic verification assistant. Your job is to verify if the provided image supports the civic issue reported by a citizen.
      
      Citizen Reported Title: "${title}"
      Citizen Reported Description: "${description}"

      Analyze the image carefully against these claims. Additionally, evaluate its priority/criticality status:
      - 'high': Severe hazard to safety, major damage, live wires, or blocked main roads.
      - 'medium': Significant issue needing attention but not immediately lethal (deep potholes, overflowing large dumpsters).
      - 'low': Minor cosmetic or baseline nuisance (graffiti, minor litter, single dead bulb).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [promptText, imagePart],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isVerified: { type: Type.BOOLEAN },
            isSpamOrUnrelated: { type: Type.BOOLEAN },
            requiresModeration: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            criticality: { 
              type: Type.STRING, 
              enum: ["low", "medium", "high"],
              description: "The priority status rating of this issue based on visual severity."
            }
          },
          required: ["isVerified", "isSpamOrUnrelated", "requiresModeration", "reason", "criticality"]
        }
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error('Gemini Pipeline Error:', error);
    return {
      isVerified: false,
      isSpamOrUnrelated: false,
      requiresModeration: false,
      reason: "Verification system fallback.",
      criticality: "medium"
    };
  }
}

module.exports = { analyzeImage };