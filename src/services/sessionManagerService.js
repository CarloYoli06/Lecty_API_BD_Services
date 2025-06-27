// sessionManagerService.js
const stateService = require('./stateService');
const activityService = require('./activityService');
const { safeAsk } = require('./geminiWrapper');
const responseService = require('./responseService');
const missingInfoService = require('./missingInfoService');
const User = require('../models/User');
const Session = require('../models/Session');
const progressEstimationService = require('./progressEstimationService');

module.exports = {
  handleUserMessage: async ({ userId, sessionId, message }) => {
    const [user, session] = await Promise.all([
      User.findOne({ US_ID: userId }),
      Session.findOne({ US_ID: userId, SESSION_ID: sessionId })
    ]);

    if (!user || !session) throw new Error('Usuario o sesión no encontrada');

    // 1. Actualizar parámetros basados en el mensaje
    await stateService.updateSessionParams(session, message);

    // 2. Manejar etapas del flujo
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
    const prompt = `Genera un saludo cálido y amigable para un niño de ${user.EDAD || 'X'} años.`;
    const saludo = await safeAsk(prompt);
    await stateService.updateStage(session, 'diagnostico');
    return responseService.formatResponse(user, saludo);
  },

  _handleDiagnostic: async (user, session, message) => {
    const missingFields = stateService.getMissingFields(user, session, 'diagnostico');
    
    if (missingFields.length > 0) {
      const pregunta = await missingInfoService.askForMissingInfo({
        campo: missingFields[0],
        user,
        session,
        mensajes: session.MENSAJES
      });
      
      // Si estamos preguntando por emociones y la respuesta indica tristeza
      if (missingFields[0] === 'EMOCION' && message.toLowerCase().includes('triste')) {
        session.EMOCION = 'baja';
        await session.save();
        return this._handleLowEmotion(user, session, message);
      }
      
      return pregunta;
    }
    
    // Si no hay campos faltantes, pasar a exploración
    await stateService.updateStage(session, 'exploracion');
    const prompt = `Transición a exploración del libro "${session.LIBRO_ACTUAL}" (${session.PROGRESO_LIBRO}% leído).`;
    return await safeAsk(prompt);
  },

  _handleLowEmotion: async (user, session, message) => {
    const activityPrompt = activityService.getActivityPrompt(session);
    const prompt = `El usuario está triste. ${activityPrompt} Genera una respuesta empática y motivadora.`;
    return await safeAsk(prompt);
  },

  _handleExploration: async (user, session, message) => {
    // Actualizar progreso si es relevante
    if (message.includes('capítulo') || message.includes('página')) {
      const nuevoAvance = await progressEstimationService.estimateProgress({
        libro: session.LIBRO_ACTUAL,
        descripcion: message
      });
      
      if (nuevoAvance) {
        session.HISTORIAL_AVANCE.push({
          libro: session.LIBRO_ACTUAL,
          avanceAnterior: session.PROGRESO_LIBRO,
          avanceActual: nuevoAvance,
          fecha: new Date()
        });
        session.PROGRESO_LIBRO = nuevoAvance;
        await session.save();
      }
    }

    // Obtener contexto de progreso
    const progressContext = activityService.getProgressContext(session);
    
    // Obtener actividad según parámetros
    const activityPrompt = activityService.getActivityPrompt(session);
    
    // Construir prompt para Gemini
    const fullPrompt = responseService.buildPrompt({
      user,
      session,
      message,
      etapa: 'exploracion',
      extraContext: `${progressContext} ${activityPrompt}`
    });
    
    return await safeAsk(fullPrompt);
  },

  _handleActivity: async (user, session, message) => {
    const activityPrompt = activityService.getActivityPrompt(session);
    const prompt = `Realiza la siguiente actividad con el usuario: ${activityPrompt}`;
    const respuesta = await safeAsk(prompt);
    
    // Después de actividad, volver a exploración o cerrar
    if (session.MENSAJES.length > 15) {
      await stateService.updateStage(session, 'cierre');
      return this._handleClosing(user, session, message);
    } else {
      await stateService.updateStage(session, 'exploracion');
      return respuesta;
    }
  },

  _handleClosing: async (user, session, message) => {
    // Generar resumen de sesión
    const resumenPrompt = `Genera un resumen breve (2-3 oraciones) de la sesión sobre "${session.LIBRO_ACTUAL}" con el usuario ${user.NOMBRE}.`;
    session.RESUMEN = await safeAsk(resumenPrompt);
    
    // Mensaje de cierre
    const cierrePrompt = `Genera un mensaje de cierre cálido para la sesión sobre "${session.LIBRO_ACTUAL}", animando al usuario a seguir leyendo.`;
    const cierre = await safeAsk(cierrePrompt);
    
    session.FINALIZADA = true;
    await session.save();
    
    return responseService.formatResponse(user, cierre);
  }
};