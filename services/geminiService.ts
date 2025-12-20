import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getMonkeyKingCommentary = async (score: number, missed: number): Promise<string> => {
  try {
    const prompt = `
      You are the legendary Monkey King (Sun Wukong). 
      A little monkey minion just played a training game catching falling eggs with their mouth.
      
      Their Stats:
      - Eggs Caught (Score): ${score}
      - Eggs Missed: ${missed}
      
      Give them a very short, funny, 1-sentence assessment of their performance. 
      If the score is high (>10), praise them arrogantly. 
      If low, roast them gently using monkey metaphors.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "The Monkey King is speechless at your performance.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The Monkey King is currently meditating (API Error). But you did well!";
  }
};