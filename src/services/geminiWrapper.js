const geminiClient = require('../utils/geminiClient');

module.exports = {
  safeAsk: async (prompt, fallback = "¡Vaya! No puedo responder ahora. ¿Quieres contarme más?") => {
  const modifiedPrompt = `${prompt}\n\n(Responde de manera breve, concisa y sin usar emojis.)`;
  console.log("Enviando prompt a Gemini:", modifiedPrompt); // <-- Añadir log
  try {
    const response = await geminiClient.ask(modifiedPrompt);
    console.log("Respuesta de Gemini:", response); // <-- Añadir log
    return response || fallback;
  } catch (error) {
    console.error("Error en Gemini:", error);
    return fallback;
  }
}
};