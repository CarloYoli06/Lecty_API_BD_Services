// fieldValidationService.js
const { safeAsk } = require('./geminiWrapper');

module.exports = {
  validateField: async ({ campo, mensaje, user, session }) => {
    if (campo !== 'LIBRO_ACTUAL') {
      // ... validación existente para otros campos
    }

    // Validación especial para libros
    const prompt = `
      El niño (${user.EDAD} años) dijo: "${mensaje}". 
      ¿Es una descripción válida de un libro o título reconocible? 
      Responde SOLO con el título del libro si es identificable, o "NO" si no.
    `;
    
    const libroIdentificado = await safeAsk(prompt);
    return libroIdentificado.includes("NO") 
      ? "NO" 
      : `SI:${libroIdentificado.trim()}`;
  }
}