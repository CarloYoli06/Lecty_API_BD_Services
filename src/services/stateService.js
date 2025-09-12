// stateService.js
const Session = require('../models/Session');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');
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

  analyzeSessionIntent: async (message, currentStage) => {
    const prompt = `
      Analiza el siguiente mensaje: "${message}"
      
      Determina la intención del usuario respecto a la sesión actual.
      Considera el contexto de que estamos en la etapa: ${currentStage}
      
      Responde en formato JSON con estos campos:
      {
        "quiereContinuar": true/false (si muestra interés en seguir conversando),
        "quiereTerminar": true/false (si indica que debe irse o quiere terminar),
        "listoParaSiguienteEtapa": true/false (si ha cumplido el objetivo de la etapa actual),
        "razon": "breve explicación de la decisión"
      }
    `;

    try {
      const response = await safeAsk(prompt);
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanResponse);
    } catch (error) {
      console.error('Error analyzing session intent:', error);
      return {
        quiereContinuar: true,
        quiereTerminar: false,
        listoParaSiguienteEtapa: false,
        razon: "Error en análisis, mantener estado actual"
      };
    }
  },

  shouldTransitionToNextStage: async (session, message) => {
    const currentStage = session.ETAPA_ACTUAL;
    const messageCount = session.MENSAJES.length;
    const params = session.PARAMETROS_ACTUALES;

    // Analizar intención del usuario
    const intent = await module.exports.analyzeSessionIntent(message, currentStage);
    
    // Si el usuario quiere terminar, ir a cierre
    if (intent.quiereTerminar) {
      return {
        shouldTransition: true,
        nextStage: 'cierre',
        reason: intent.razon
      };
    }

    // Reglas específicas por etapa
    switch (currentStage) {
      case 'saludo':
        // Pasar a diagnóstico después del primer intercambio
        return {
          shouldTransition: true,
          nextStage: 'diagnostico',
          reason: 'Saludo completado'
        };

      case 'diagnostico':
        // Verificar si tenemos toda la información necesaria
        const missingFields = await module.exports.getMissingFields(
          await User.findOne({ US_ID: session.US_ID }), 
          session
        );
        return {
          shouldTransition: missingFields.length === 0,
          nextStage: 'exploracion',
          reason: missingFields.length === 0 ? 
            'Información completa' : 
            `Faltan campos: ${missingFields.join(', ')}`
        };

      case 'exploracion':
        // Transicionar basado en comprensión y mensajes
        const altaComprension = params.comprension === 'alta';
        const suficientesMensajes = messageCount >= (altaComprension ? 5 : 8);
        
        return {
          shouldTransition: suficientesMensajes || intent.listoParaSiguienteEtapa,
          nextStage: 'actividad',
          reason: suficientesMensajes ? 
            'Suficientes mensajes de exploración' : 
            intent.razon
        };

      case 'actividad':
        // Evaluar si la actividad fue exitosa
        const actividadExitosa = params.motivacion === 'alta' || 
                                params.emocion === 'positiva';
        
        return {
          shouldTransition: actividadExitosa || messageCount > 15,
          nextStage: intent.quiereContinuar ? 'exploracion' : 'cierre',
          reason: actividadExitosa ? 
            'Actividad completada exitosamente' : 
            'Límite de mensajes alcanzado'
        };

      case 'cierre':
        return {
          shouldTransition: false,
          nextStage: null,
          reason: 'Etapa final'
        };

      default:
        return {
          shouldTransition: false,
          nextStage: null,
          reason: 'Etapa no reconocida'
        };
    }
  },

  updateStage: async (session, nextStage, message) => {
    // Validar transiciones permitidas
    const validTransitions = {
      saludo: ['diagnostico'],
      diagnostico: ['exploracion', 'cierre'],
      exploracion: ['actividad', 'cierre'],
      actividad: ['exploracion', 'cierre'],
      cierre: []
    };
    
    // Verificar si debemos transicionar
    const transitionResult = await module.exports.shouldTransitionToNextStage(session, message);
    
    // Si no debemos transicionar o la transición no es válida, mantener estado actual
    if (!transitionResult.shouldTransition || 
        !validTransitions[session.ETAPA_ACTUAL].includes(transitionResult.nextStage)) {
      console.log(`Manteniendo etapa ${session.ETAPA_ACTUAL}: ${transitionResult.reason}`);
      return false;
    }
    
    // Usar la etapa sugerida por shouldTransitionToNextStage si no se especificó una
    const newStage = nextStage || transitionResult.nextStage;
    
    // Actualizar la etapa y el objetivo
    const previousStage = session.ETAPA_ACTUAL;
    session.ETAPA_ACTUAL = newStage;
    
    // Actualizar objetivo según la etapa
    session.OBJETIVO_SESION = {
      saludo: 'Establecer conexión inicial con el usuario',
      diagnostico: 'Recopilar información necesaria sobre el usuario y su lectura',
      exploracion: 'Profundizar en la comprensión y disfrute del libro',
      actividad: 'Reforzar el aprendizaje y la motivación mediante actividades',
      cierre: 'Concluir la sesión de manera positiva y motivadora'
    }[newStage];
    
    // Registrar la transición
    console.log(`Transición de ${previousStage} a ${newStage}: ${transitionResult.reason}`);
    
    await session.save();
    return true;
  },

  analyzeMessage: async (message) => {
    if (!message || message === 'undefined') {
    return {
      quiereContinuar: false,
      quiereTerminar: false,
      listoParaSiguienteEtapa: false,
      razon: "Mensaje inválido recibido"
    };
  }
    const prompt = `Analiza el mensaje: "${message}". 
    Determina SOLO si hay señales claras en el texto. Si el mensaje es breve, ambiguo o no expresa emociones (por ejemplo: "hola", "ok", "sí"), responde "media" o "neutra" según corresponda.
No asumas emociones negativas o motivación baja a menos que el mensaje lo indique explícitamente (por ejemplo: "estoy triste", "no quiero leer", "me aburro").:
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
        motivacion: (result.motivacion?.toLowerCase() === 'neutra' ? 'media' : result.motivacion?.toLowerCase()) || 'media'
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
  },

  /**
   * Analiza el mensaje del agente para determinar la animación correspondiente.
   * @param {string} agentMessage - El texto de respuesta generado por el agente.
   * @returns {Promise<string>} - Una cadena con la animación ('feliz', 'alegre', 'triste', 'enojado').
   */
  analyzeAgentAnimation: async (agentMessage) => {
    const prompt = `Analiza la emoción en el siguiente mensaje: "${agentMessage}".
    Responde únicamente con una de las siguientes palabras según la emoción principal que detectes:
    - "Feliz" (para emociones positivas y de calma)
    - "Baile" (para emociones de alta energía, entusiasmo o sorpresa positiva)
    - "Triste" (para empatía, melancolía o desánimo)
    - "Enojado" (para frustración o enfado)
    Tu respuesta debe ser solo una de esas cuatro palabras.`;

    try {
      // Usamos 'feliz' como respuesta por defecto si Gemini falla.
      const response = await safeAsk(prompt, 'feliz'); 
      const animation = response.trim().toLowerCase();
      const validAnimations = ['feliz', 'alegre', 'triste', 'enojado'];

      // Validamos que la respuesta sea una de las animaciones permitidas.
      if (validAnimations.includes(animation)) {
        return animation;
      }
      return 'feliz'; // Retornamos 'feliz' si la respuesta no es válida.
    } catch (error) {
      console.error('Error analizando la animación del agente:', error);
      return 'feliz'; // Animación por defecto en caso de error.
    }
  }
};