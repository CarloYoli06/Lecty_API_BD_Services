// stateService.js
const Session = require('../models/Session');
const { safeAsk } = require('./geminiWrapper');

module.exports = {
  getCurrentStage: (session) => session.ETAPA_ACTUAL || 'saludo',

  getMissingFields: (user, session, stage) => {
    const missing = [];
    if (stage === 'diagnostico') {
      if (!user.EDAD) missing.push('EDAD');
      if (!user.NOMBRE) missing.push('NOMBRE');
      if (!session.LIBRO_ACTUAL) missing.push('LIBRO_ACTUAL');
      if (!session.PROGRESO_LIBRO) missing.push('PROGRESO_LIBRO');
    }
    return missing;
  },

  updateStage: async (session, nextStage) => {
    session.ETAPA_ACTUAL = nextStage;
    await session.save();
  },

  updateSessionParams: async (session, message) => {
    const prompt = `Analiza el mensaje del niño: "${message}". 
    Evalúa:
    1. Comprensión (alta/media/baja) - ¿Entiende bien el contenido?
    2. Emoción (alta/media/baja) - ¿Cómo se siente?
    3. Motivación (alta/media/baja) - ¿Está interesado en continuar?
    Responde en formato JSON: { "comprension": "", "emocion": "", "motivacion": "" }`;
    
    try {
      let response = await safeAsk(prompt);
      // Limpiar bloque de código si lo hay
      response = response.replace(/```json|```/gi, '').trim();
      // Buscar el primer y último corchete para extraer el JSON
      const first = response.indexOf('{');
      const last = response.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        response = response.substring(first, last + 1);
      }
      const params = JSON.parse(response);
      
      session.COMPRENSION = params.comprension || session.COMPRENSION;
      session.EMOCION = params.emocion || session.EMOCION;
      session.MOTIVACION = params.motivacion || session.MOTIVACION;
      
      await session.save();
    } catch (error) {
      console.error('Error actualizando parámetros:', error);
    }
  },

  getActivityType: (session) => {
    if (session.EMOCION === 'baja') return 'emocion';
    if (session.MOTIVACION === 'baja') return 'motivacion';
    if (session.COMPRENSION === 'baja') return 'comprension';
    return null;
  }
};