// sessionManagerService.js
const stateService = require('./stateService');
const activityService = require('./activityService');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');
const Session = require('../models/Session');

// Guarda el mensaje en la sesión
async function saveMessage(session, contenido, emisor = 'ia', emocion = null) {
  session.MENSAJES.push({
    IDM: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    CONTENIDO: contenido,
    EMISOR: emisor,
    FECHA_HORA: new Date(),
    EMOCION: emocion || session.EMOCION
  });
  await session.save();
}

module.exports = {
  handleUserMessage: async ({ userId, sessionId, message }) => {
    const [user, session] = await Promise.all([
      User.findOne({ US_ID: userId }),
      Session.findOne({ US_ID: userId, SESSION_ID: sessionId })
    ]);

    if (!user || !session) throw new Error('Usuario o sesión no encontrada');

    // Guardar mensaje del usuario
    await saveMessage(session, message, 'usuario');

    // Actualizar parámetros de la sesión según el mensaje
    await stateService.updateSessionParameters(session, message);

    // Flujo de etapas
    switch (session.ETAPA_ACTUAL) {
      case 'saludo':
        return await module.exports._handleGreeting(user, session);
      case 'diagnostico':
        return await module.exports._handleDiagnostic(user, session, message);
      case 'exploracion':
        return await module.exports._handleExploration(user, session, message);
      case 'actividad':
        return await module.exports._handleActivity(user, session, message);
      case 'cierre':
        return await module.exports._handleClosing(user, session, message);
      default:
        return "¡Ups! No entendí en qué parte de la conversación estamos. ¿Puedes intentarlo de nuevo?";
    }
  },

  _handleGreeting: async (user, session) => {
    const prompt = `Genera un saludo cálido y amigable para ${user.NOMBRE || 'un niño'} de ${user.EDAD || 'X'} años.`;
    const saludo = await safeAsk(prompt);
    
    session.MENSAJES.push({
      CONTENIDO: saludo,
      EMISOR: 'sistema',
      PARAMETROS: session.PARAMETROS_ACTUALES
    });
    
    await stateService.updateStage(session, 'diagnostico');
    await session.save();
    return saludo;
  },

  _handleDiagnostic: async (user, session, message) => {
    // Check if message contains book info
    if (!session.LIBRO_ACTUAL && message) {
      const bookPrompt = `El usuario dijo: "${message}". ¿Menciona algún libro? Responde SOLO con el título del libro o "NO".`;
      const bookResponse = await safeAsk(bookPrompt);
      
      if (!bookResponse.includes("NO")) {
        session.LIBRO_ACTUAL = bookResponse.trim();
      }
    }

    // Check if message contains progress info
    if (session.LIBRO_ACTUAL && !session.PROGRESO_LIBRO && message) {
      const progressPrompt = `El usuario está leyendo "${session.LIBRO_ACTUAL}" y dijo: "${message}". 
      ¿Menciona su progreso? Responde SOLO con el porcentaje estimado (0-100) o "NO".`;
      const progressResponse = await safeAsk(progressPrompt);
      
      if (!progressResponse.includes("NO")) {
        session.PROGRESO_LIBRO = parseInt(progressResponse) || 0;
        session.HISTORIAL_AVANCE.push({
          libro: session.LIBRO_ACTUAL,
          avanceAnterior: 0,
          avanceActual: session.PROGRESO_LIBRO
        });
      }
    }

    const missingFields = await stateService.getMissingFields(user, session);
    
 if (missingFields.length > 0) {
      const field = missingFields[0];
      
      // GENERACIÓN DINÁMICA DE PREGUNTAS CON CONTEXTO
      const context = session.MENSAJES.slice(-3).map(m => m.CONTENIDO).join(' | ');
      
      const promptMap = {
        EDAD: `Niño de edad desconocida. Conversación reciente: "${context}". Pregunta su edad de forma natural y amigable.`,
        NOMBRE: `Conversación reciente: "${context}". Pregunta su nombre de forma cálida.`,
        LIBRO_ACTUAL: `Conversación reciente: "${context}". Pregunta qué libro está leyendo de forma natural.`,
        PROGRESO_LIBRO: `El usuario lee "${session.LIBRO_ACTUAL}". Conversación reciente: "${context}". Pregunta por dónde va en el libro de forma natural.`
      };

      const question = await safeAsk(promptMap[field]);
      
      session.MENSAJES.push({
        CONTENIDO: question,
        EMISOR: 'sistema',
        PARAMETROS: session.PARAMETROS_ACTUALES
      });
      
      await session.save();
      return question;
    
    }

    // If all diagnostic info is collected, move to conversation
    await stateService.updateStage(session, 'conversacion');
    const context = await activityService.getProgressContext(user.US_ID, session.LIBRO_ACTUAL);
    
    const transitionPrompt = `Genera un mensaje de transición a la conversación sobre "${session.LIBRO_ACTUAL}" ` +
                            `(${session.PROGRESO_LIBRO}% leído). ${context}`;
    const transitionMessage = await safeAsk(transitionPrompt);
    
    session.MENSAJES.push({
      CONTENIDO: transitionMessage,
      EMISOR: 'sistema',
      PARAMETROS: session.PARAMETROS_ACTUALES
    });
    
    await session.save();
    return transitionMessage;
  },

  _handleExploration: async (user, session, message) => {
    // Lógica para manejar la etapa de exploración
    // Podría involucrar hacer preguntas al usuario sobre sus intereses, etc.
    const explorationPrompt = `El usuario está en la etapa de exploración. Dile algo como "¡Genial! Explorar nuevos libros es divertido. ¿Tienes algún tema o género en mente?"`;
    const explorationMessage = await safeAsk(explorationPrompt);
    
    session.MENSAJES.push({
      CONTENIDO: explorationMessage,
      EMISOR: 'sistema',
      PARAMETROS: session.PARAMETROS_ACTUALES
    });
    
    await stateService.updateStage(session, 'actividad');
    await session.save();
    return explorationMessage;
  },

  _handleActivity: async (user, session, message) => {
    // Lógica para manejar la etapa de actividad
    // Podría involucrar sugerir actividades relacionadas con la lectura, como juegos de palabras, preguntas sobre el libro, etc.
    const activityPrompt = `El usuario está en la etapa de actividad. Sugiere una actividad divertida y educativa relacionada con la lectura.`;
    const activityMessage = await safeAsk(activityPrompt);
    
    session.MENSAJES.push({
      CONTENIDO: activityMessage,
      EMISOR: 'sistema',
      PARAMETROS: session.PARAMETROS_ACTUALES
    });
    
    await stateService.updateStage(session, 'cierre');
    await session.save();
    return activityMessage;
  },

  _handleClosing: async (user, session, message) => {
    // Generate session summary
    const summaryPrompt = `Genera un resumen breve (2-3 oraciones) de la sesión sobre "${session.LIBRO_ACTUAL}" con ${user.NOMBRE}.`;
    session.RESUMEN_SESION = await safeAsk(summaryPrompt);
    
    // Closing message
    const closingPrompt = `Genera un mensaje de cierre cálido para ${user.NOMBRE} sobre la sesión de "${session.LIBRO_ACTUAL}".`;
    const closingMessage = await safeAsk(closingPrompt);
    
    session.FINALIZADA = true;
    session.MENSAJES.push({
      CONTENIDO: closingMessage,
      EMISOR: 'sistema',
      PARAMETROS: session.PARAMETROS_ACTUALES
    });
    
    await session.save();
    return closingMessage;
  }
};