// stateService.js
const Session = require('../models/Session');
const { safeAsk } = require('./geminiWrapper');

module.exports = {
  getCurrentStage: (session) => session.ETAPA_ACTUAL || 'saludo',

  getMissingFields: async (user, session) => {
    const missing = [];
    if (!user.EDAD) missing.push('EDAD');
    if (!user.NOMBRE) missing.push('NOMBRE');
    if (!session.LIBRO_ACTUAL) missing.push('LIBRO_ACTUAL');
    if (session.LIBRO_ACTUAL && !session.PROGRESO_LIBRO) missing.push('PROGRESO_LIBRO');
    return missing;
  },

  updateStage: async (session, nextStage) => {
    session.ETAPA_ACTUAL = nextStage;
    await session.save();
  },

  analyzeMessage: async (message) => {
    const prompt = `Analiza el mensaje: "${message}". Determina:
    1. Comprensión (alta/media/baja) - ¿Entiende bien el contenido?
    2. Emoción (alta/media/baja) - ¿Cómo se siente?
    3. Motivación (alta/media/baja) - ¿Está interesado en continuar?
    Responde SOLO en formato JSON: { "comprension": "", "emocion": "", "motivacion": "" }`;
    
    try {
      const response = await safeAsk(prompt);
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const first = cleanResponse.indexOf('{');
      const last = cleanResponse.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        return JSON.parse(cleanResponse.substring(first, last + 1));
      }
      return {
        comprension: 'media',
        emocion: 'media',
        motivacion: 'media'
      };
    } catch (error) {
      console.error('Error analyzing message:', error);
      return {
        comprension: 'media',
        emocion: 'media',
        motivacion: 'media'
      };
    }
  },

  updateSessionParameters: async (session, message) => {
    const params = await module.exports.analyzeMessage(message);
    
    session.PARAMETROS_ACTUALES = {
      comprension: params.comprension || session.PARAMETROS_ACTUALES.comprension,
      emocion: params.emocion || session.PARAMETROS_ACTUALES.emocion,
      motivacion: params.motivacion || session.PARAMETROS_ACTUALES.motivacion
    };
    
    session.HISTORIAL_PARAMETROS.push({
      comprension: session.PARAMETROS_ACTUALES.comprension,
      emocion: session.PARAMETROS_ACTUALES.emocion,
      motivacion: session.PARAMETROS_ACTUALES.motivacion
    });
    
    await session.save();
  },

  shouldEndSession: (session) => {
    // End session if parameters are low for too long
    const lowParamsCount = session.HISTORIAL_PARAMETROS
      .slice(-3)
      .filter(p => p.emocion === 'baja' || p.motivacion === 'baja')
      .length;
      
    return lowParamsCount >= 3 || 
           session.MENSAJES.length > 20 ||
           (session.ETAPA_ACTUAL === 'conversacion' && session.MENSAJES.length > 10);
  },

  getPriorityParameter: (session) => {
    const params = session.PARAMETROS_ACTUALES;
    if (params.emocion === 'baja') return 'emocion';
    if (params.motivacion === 'baja') return 'motivacion';
    if (params.comprension === 'baja') return 'comprension';
    return null;
  }
};