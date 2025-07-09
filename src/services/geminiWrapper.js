const geminiClient = require('../utils/geminiClient');

module.exports = {
  safeAsk: async (prompt, fallback = "¡Vaya! No puedo responder ahora. ¿Quieres contarme más?") => {
  console.log("Enviando prompt a Gemini:", prompt); // <-- Añadir log
  try {
    const response = await geminiClient.ask(prompt);
    console.log("Respuesta de Gemini:", response); // <-- Añadir log
    return response || fallback;
  } catch (error) {
    console.error("Error en Gemini:", error);
    return fallback;
  }
}
};