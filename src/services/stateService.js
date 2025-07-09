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

  shouldTransitionToNextStage: (session) => {
    const messageCount = session.MENSAJES.length;
    const params = session.PARAMETROS_ACTUALES;
    
    // Condiciones por etapa
    switch (session.ETAPA_ACTUAL) {
      case 'exploracion':
        // Transicionar a actividad después de 5-7 mensajes con buena interacción
        return messageCount >= 5 && 
               params.motivacion !== 'baja' && 
               params.emocion !== 'negativa';
               
      case 'actividad':
        // Transicionar a cierre si la actividad fue exitosa
        const ultimosParams = session.HISTORIAL_PARAMETROS.slice(-2);
        const mejoraEmocional = ultimosParams.every(p => 
          p.emocion === 'positiva' || p.motivacion === 'alta'
        );
        return mejoraEmocional || messageCount > 15;
        
      case 'cierre':
        return true; // Siempre cerrar cuando se llega a esta etapa
        
      default:
        return false;
    }
  },

  updateStage: async (session, nextStage) => {
    // Validar transiciones permitidas
    const validTransitions = {
      saludo: ['diagnostico'],
      diagnostico: ['exploracion'],
      exploracion: ['actividad', 'cierre'],
      actividad: ['exploracion', 'cierre'],
      cierre: []
    };
    
    // Verificar si es momento de transicionar
    if (nextStage !== 'cierre' && !module.exports.shouldTransitionToNextStage(session)) {
      return false;
    }
    
    if (validTransitions[session.ETAPA_ACTUAL].includes(nextStage)) {
      const previousStage = session.ETAPA_ACTUAL;
      session.ETAPA_ACTUAL = nextStage;
      
      // Actualizar objetivo según la etapa
      session.OBJETIVO_SESION = {
        saludo: 'Establecer conexión inicial con el usuario',
        diagnostico: 'Recopilar información necesaria sobre el usuario y su lectura',
        exploracion: 'Profundizar en la comprensión y disfrute del libro',
        actividad: 'Reforzar el aprendizaje y la motivación mediante actividades',
        cierre: 'Concluir la sesión de manera positiva y motivadora'
      }[nextStage];
      
      await session.save();
      return true;
    }
    
    console.warn(`Transición inválida de ${session.ETAPA_ACTUAL} a ${nextStage}`);
    return false;
  },

  analyzeMessage: async (message) => {
    const prompt = `Analiza el mensaje: "${message}". Determina:
    1. Comprensión (alta/media/baja) - ¿Entiende bien el contenido?
    2. Emoción (positiva/neutra/negativa) - ¿Cómo se siente?
    3. Motivación (alta/media/baja) - ¿Está interesado en continuar?
    Responde SOLO en formato JSON: { "comprension": "", "emocion": "", "motivacion": "" }`;
    
    try {
      const response = await safeAsk(prompt);
      console.log('Enviando prompt a Gemini:', prompt);
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanResponse);
      
      // No convertimos la emoción, la dejamos como viene (positiva/neutra/negativa)
      return {
        comprension: result.comprension?.toLowerCase() || 'media',
        emocion: result.emocion?.toLowerCase() || 'neutra',
        motivacion: result.motivacion?.toLowerCase() || 'media'
      };
    } catch (error) {
      console.error('Error analyzing message:', error);
      return {
        comprension: 'media',
        emocion: 'neutra',
        motivacion: 'media'
      };
    }
  },

  updateSessionParameters: async (session, message) => {
    const params = await module.exports.analyzeMessage(message);
    
    session.PARAMETROS_ACTUALES = {
      comprension: params.comprension || session.PARAMETROS_ACTUALES?.comprension || 'media',
      emocion: params.emocion || session.PARAMETROS_ACTUALES?.emocion || 'neutra',
      motivacion: params.motivacion || session.PARAMETROS_ACTUALES?.motivacion || 'media'
    };
    
    session.HISTORIAL_PARAMETROS.push({
      comprension: session.PARAMETROS_ACTUALES.comprension,
      emocion: session.PARAMETROS_ACTUALES.emocion,
      motivacion: session.PARAMETROS_ACTUALES.motivacion,
      fecha: new Date()
    });
    
    await session.save();
  },

  shouldEndSession: (session) => {
    // End session if parameters are low for too long
    const lowParamsCount = session.HISTORIAL_PARAMETROS
      .slice(-3)
      .filter(p => p.emocion === 'negativa' || p.motivacion === 'baja')
      .length;
      
    return lowParamsCount >= 3 || 
           session.MENSAJES.length > 20 ||
           (session.ETAPA_ACTUAL === 'conversacion' && session.MENSAJES.length > 10);
  },

  getPriorityParameter: (session) => {
    const params = session.PARAMETROS_ACTUALES;
    if (!params) return null;
    
    // Prioridad: emoción negativa > motivación baja > comprensión baja
    if (params.emocion === 'negativa') return 'emocion';
    if (params.motivacion === 'baja') return 'motivacion';
    if (params.comprension === 'baja') return 'comprension';
    return null;
  },

  getActivityType: (session) => {
    return module.exports.getPriorityParameter(session) || 'general';
  }
};