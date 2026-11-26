export const getMonkeyKingCommentary = async (score: number, missed: number): Promise<string> => {
  try {
    const response = await fetch('/api/commentary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ score, missed }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      if (errData.commentary) {
        return errData.commentary;
      }
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();
    return data.commentary || "The Monkey King is speechless at your performance.";
  } catch (error) {
    console.error("Gemini Commentary Request Error:", error);
    return "The Monkey King is currently meditating (API Error). But you did well!";
  }
};