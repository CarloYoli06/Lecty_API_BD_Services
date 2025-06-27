// sessionManagerService.js
const stateService = require('./stateService');
const activityService = require('./activityService');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');
const Session = require('../models/Session');

module.exports = {
  handleUserMessage: async ({ userId, sessionId, message }) => {
    const [user, session] = await Promise.all([
      User.findOne({ US_ID: userId }),
      Session.findOne({ US_ID: userId, SESSION_ID: sessionId })
    ]);

    if (!user || !session) throw new Error('Usuario o sesión no encontrada');

    // Add message to session
    session.MENSAJES.push({
      CONTENIDO: message,
      EMISOR: 'usuario',
      PARAMETROS: session.PARAMETROS_ACTUALES
    });

    // Update parameters based on message
    await stateService.updateSessionParameters(session, message);

    // Handle stage transitions
    switch (session.ETAPA_ACTUAL) {
      case 'saludo':
        return await this._handleGreeting(user, session);
      case 'diagnostico':
        return await this._handleDiagnostic(user, session, message);
      case 'conversacion':
        return await this._handleConversation(user, session, message);
      case 'cierre':
        return await this._handleClosing(user, session, message);
      default:
        return "¡Vaya! Algo salió mal. ¿Podrías intentarlo de nuevo?";
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
      let question;
      
      if (field === 'EDAD') {
        question = "¡Hola! Para recomendarte libros geniales, dime ¿cuántos años tienes?";
      } else if (field === 'NOMBRE') {
        question = "¡Qué gusto leer contigo! ¿Cómo te llamas?";
      } else if (field === 'LIBRO_ACTUAL') {
        question = "¿Qué libro estás leyendo ahora? Puedes decirme el título o contarme de qué trata.";
      } else if (field === 'PROGRESO_LIBRO') {
        question = `¿Por qué parte vas en "${session.LIBRO_ACTUAL}"? (Ejemplo: "voy por el capítulo donde...")`;
      }
      
      if (question) {
        session.MENSAJES.push({
          CONTENIDO: question,
          EMISOR: 'sistema',
          PARAMETROS: session.PARAMETROS_ACTUALES
        });
        await session.save();
        return question;
      }
    }

    // If all diagnostic info is collected, move to conversation
    await stateService.updateStage(session, 'conversacion');
    const context = await activityService.getSessionContext(user.US_ID, session.LIBRO_ACTUAL);
    
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

  _handleConversation: async (user, session, message) => {
    // Check if we should end session
    if (stateService.shouldEndSession(session)) {
      await stateService.updateStage(session, 'cierre');
      return this._handleClosing(user, session, message);
    }

    // Get appropriate activity based on parameters
    const activityPrompt = activityService.getActivityPrompt(session);
    const context = await activityService.getSessionContext(user.US_ID, session.LIBRO_ACTUAL);
    
    const fullPrompt = `Eres un asistente de lectura para niños. Usuario: ${user.NOMBRE} (${user.EDAD} años). 
      Libro actual: "${session.LIBRO_ACTUAL}" (${session.PROGRESO_LIBRO}% leído).
      Estado actual: Comprensión ${session.PARAMETROS_ACTUALES.comprension}, 
      Emoción ${session.PARAMETROS_ACTUALES.emocion}, 
      Motivación ${session.PARAMETROS_ACTUALES.motivacion}.
      ${context}
      Actividad sugerida: ${activityPrompt}
      Último mensaje del usuario: "${message}"
      Respuesta (1-2 oraciones, tono amigable):`;
    
    const response = await safeAsk(fullPrompt);
    
    session.MENSAJES.push({
      CONTENIDO: response,
      EMISOR: 'sistema',
      PARAMETROS: session.PARAMETROS_ACTUALES
    });
    
    // Update progress if mentioned
    if (message.includes('capítulo') || message.includes('página') || message.includes('avancé')) {
      const progressPrompt = `El usuario dijo: "${message}" sobre "${session.LIBRO_ACTUAL}". 
        Estima el nuevo porcentaje de avance (0-100). Responde SOLO con el número.`;
      const progressResponse = await safeAsk(progressPrompt);
      const newProgress = parseInt(progressResponse) || session.PROGRESO_LIBRO;
      
      if (newProgress !== session.PROGRESO_LIBRO) {
        session.HISTORIAL_AVANCE.push({
          libro: session.LIBRO_ACTUAL,
          avanceAnterior: session.PROGRESO_LIBRO,
          avanceActual: newProgress
        });
        session.PROGRESO_LIBRO = newProgress;
      }
    }
    
    await session.save();
    return response;
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