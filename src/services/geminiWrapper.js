const geminiClient = require('../utils/geminiClient');

module.exports = {
  safeAsk: async (prompt, fallback = "¡Vaya! No puedo responder ahora. ¿Quieres contarme más?") => {
    try {
      const response = await geminiClient.ask(prompt);
      return response || fallback;
    } catch (error) {
      console.error("Error en Gemini:", error);
      return fallback;
    }
  },

  validateResponse: async (prompt) => {
    try {
      const response = await this.safeAsk(prompt, 'NO');
      return response.trim().toUpperCase();
    } catch (error) {
      return 'NO';
    }
  }
};