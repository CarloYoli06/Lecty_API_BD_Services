// fieldValidationService.js
const { safeAsk } = require('./geminiWrapper');

module.exports = {
  validateField: async ({ campo, mensaje, user, session }) => {
      if (campo === 'LIBRO_ACTUAL') {
    const prompt = `Analiza: "${mensaje}". ¿Contiene claramente el título de un libro infantil conocido? 
      Responde SOLO con el título exacto entre comillas o "NO".`;
    
    const respuesta = await safeAsk(prompt);
    return respuesta.includes('"') ? `SI:${respuesta.replace(/"/g, '')}` : "NO";
  }
  }
}