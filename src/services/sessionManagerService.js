const User = require('../models/User');
const Session = require('../models/Session');
const { generateEmpatheticResponse } = require('./empathyService');
const { generateMotivationalMessage } = require('./motivationService');
const { suggestActivity } = require('./activityService');
const { safeAsk, validateResponse } = require('./geminiWrapper');
const missingInfoService = require('./missingInfoService');
const progressEstimationService = require('./progressEstimationService');
const fieldValidationService = require('./fieldValidationService');
const stateService = require('./stateService');
const responseService = require('./responseService');

const LIBROS_POPULARES = [
  "El Principito",
  "Alicia en el País de las Maravillas",
  "Caperucita Roja",
  "Pinocho",
  "Peter Pan",
  "La Cenicienta",
  "Blanca Nieves",
  "Hansel y Gretel",
  "La Bella Durmiente",
  "Rapunzel",
  "El Patito Feo",
  "Pulgarcito",
  "La Sirenita",
  "Los Tres Cerditos",
  "Juan y las Habichuelas Mágicas"
];

// Mapa para identificación temporal de libros
const libroDescripcionPendiente = new Map();

const getShortHistory = (mensajes, max = 4, user) => {
  return mensajes
    .slice(-max)
    .map(m => `${m.EMISOR === 'usuario' ? (user.NOMBRE_P || user.NOMBRE) : 'Agente'}: ${m.CONTENIDO}`)
    .join('\n');
};

module.exports = {
  handleUserMessage: async ({ userId, sessionId, message, emotion }) => {
    const [user, session] = await Promise.all([
      User.findOne({ US_ID: userId }),
      Session.findOne({ US_ID: userId, SESSION_ID: sessionId })
    ]);
    console.log(`Manejando mensaje del usuario ${userId} en sesión ${sessionId}: "${message}"`);
    if (!user || !session) {
      throw new Error('Usuario o sesión no encontrada');
    }

    try {
      // --- NUEVO FLUJO INTELIGENTE ---
      let etapa = stateService.getCurrentStage(session);
      let missingFields = stateService.getMissingFields(user, session, 'diagnostico');
      let cambios = false;
      let ultimoMensaje = message;
      // Analizar el mensaje para extraer todos los campos posibles de una sola vez
      for (let i = 0; i < missingFields.length; i++) {
        const field = missingFields[i];
        const validation = await fieldValidationService.validateField({
          campo: field,
          mensaje: ultimoMensaje,
          user,
          session
        });
        if (validation.startsWith('SI:')) {
          const value = validation.split(':')[1].trim();
          await module.exports._updateFieldData(user, session, field, value);
          cambios = true;
          // Si es libro, guardar y seguir; si es progreso, estimar y guardar
          if (field === 'LIBRO_ACTUAL') {
            // Si se identificó el libro, preguntar por el progreso si falta
            missingFields = stateService.getMissingFields(user, session, 'diagnostico');
            if (missingFields.includes('PROGRESO_LIBRO')) {
              const prompt = responseService.buildPrompt({
                user,
                session,
                message,
                etapa: 'diagnostico',
                extraContext: `El usuario ya identificó el libro. Pregunta por el progreso de forma natural y breve, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
              });
              return await safeAsk(prompt);
            }
          }
          // Si es progreso, no hay que preguntar nada más si ya no falta nada
          missingFields = stateService.getMissingFields(user, session, 'diagnostico');
          if (missingFields.length === 0) {
            await stateService.updateStage(session, 'exploracion');
            const prompt = responseService.buildPrompt({
              user,
              session,
              message,
              etapa: 'transicion',
              extraContext: 'Todos los datos del diagnóstico están completos. Haz una transición cálida y breve a la exploración, usando el historial:\n' + getShortHistory(session.MENSAJES, 4, user)
            });
            return await safeAsk(prompt);
          }
        }
      }
      // Si aún faltan campos, preguntar SOLO por el primero faltante
      missingFields = stateService.getMissingFields(user, session, 'diagnostico');
      if (missingFields.length > 0 && (etapa === 'saludo' || etapa === 'diagnostico')) {
        // Generar prompt para preguntar SOLO por el campo faltante
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'diagnostico',
          extraContext: `Falta conocer el dato "${missingFields[0]}". Haz una pregunta cálida, breve y personalizada para obtenerlo, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        // Cambiar etapa a diagnostico si estaba en saludo
        if (etapa === 'saludo') await stateService.updateStage(session, 'diagnostico');
        return await safeAsk(prompt);
      }
      // Si no faltan campos y estamos en diagnostico o saludo, pasar a exploracion
      if ((etapa === 'saludo' || etapa === 'diagnostico') && missingFields.length === 0) {
        await stateService.updateStage(session, 'exploracion');
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'transicion',
          extraContext: 'Todos los datos del diagnóstico están completos. Haz una transición cálida y breve a la exploración, usando el historial:\n' + getShortHistory(session.MENSAJES, 4, user)
        });
        return await safeAsk(prompt);
      }
      // Si ya estamos en exploracion, actividad, etc, seguir el flujo normal
      etapa = stateService.getCurrentStage(session);
      switch (etapa) {
        case 'exploracion':
          return await module.exports._handleExploration(user, session, message);
        case 'actividad':
          return await module.exports._handleActivity(user, session, message);
        case 'reflexion':
          return await module.exports._handleReflection(user, session, message);
        case 'cierre':
          return await module.exports._handleClosing(user, session, message);
        default:
          // Si por alguna razón no hay etapa válida, saludar de forma cálida y personalizada
          const prompt = responseService.buildPrompt({
            user,
            session,
            message,
            etapa: 'saludo',
            extraContext: 'Saluda de forma cálida y breve para iniciar la sesión de lectura.'
          });
          return await safeAsk(prompt);
      }
    } catch (error) {
      console.error('Error en handleUserMessage:', error);
      return responseService.formatResponse(user, "¡Vaya! Algo salió mal. ¿Quieres intentarlo de nuevo?");
    }
  },

  // --- Handlers privados para cada etapa ---

  _handleBookIdentification: async (sessionId, message, session, user) => {
    const estado = libroDescripcionPendiente.get(sessionId);
    // 1. Consultar a Gemini si ya se puede identificar el libro con el historial
    const historial = getShortHistory(session.MENSAJES, 6, user) + `\nUsuario: ${message}`;
    const consultaLibro = await safeAsk(
      `Con base en este historial de conversación, ¿ya se puede identificar el libro actual que el usuario está leyendo? Si sí, responde SOLO el nombre del libro. Si no, responde SOLO "NO".\n\nHistorial:\n${historial}`
    );
    if (consultaLibro && consultaLibro.trim().toUpperCase() !== 'NO') {
      // Gemini identificó el libro
      session.LIBRO_ACTUAL = consultaLibro.trim();
      await session.save();
      libroDescripcionPendiente.delete(sessionId);
      // Avanzar el flujo: pedir progreso o pasar a exploración
      const remainingFields = stateService.getMissingFields(user, session, 'diagnostico');
      if (remainingFields.includes('PROGRESO_LIBRO')) {
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'diagnostico',
          extraContext: `El usuario ya identificó el libro. Pregunta por el progreso de forma natural y breve, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      } else {
        await stateService.updateStage(session, 'exploracion');
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'transicion',
          extraContext: `El usuario ya identificó el libro. Haz una transición cálida y breve a la exploración, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      }
    }
    // 2. Si no, seguir con la lógica de confirmación tradicional
    const respuesta = await validateResponse(
      `El niño dijo: "${message}" sobre el libro "${estado.libroSugerido}". ¿Confirmó que es correcto? Responde solo SI o NO, acepta variantes como "sí, es ese", "sí", "claro", "correcto" como afirmativo.`
    );

    if (/^SI/i.test(respuesta) || /sí|claro|correcto/i.test(message)) {
      session.LIBRO_ACTUAL = estado.libroSugerido;
      await session.save();
      libroDescripcionPendiente.delete(sessionId);
      const remainingFields = stateService.getMissingFields(user, session, 'diagnostico');
      if (remainingFields.includes('PROGRESO_LIBRO')) {
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'diagnostico',
          extraContext: `El usuario acaba de confirmar el libro que está leyendo. Pregunta por el progreso de forma natural y breve, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      } else {
        await stateService.updateStage(session, 'exploracion');
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'transicion',
          extraContext: `El usuario confirmó el libro. Haz una transición cálida y breve a la exploración, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      }
    } else {
      libroDescripcionPendiente.delete(sessionId);
      const prompt = responseService.buildPrompt({
        user,
        session,
        message,
        etapa: 'diagnostico',
        extraContext: `El usuario no confirmó el libro. Pide el nombre o una descripción diferente de forma cálida y breve, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
      });
      return await safeAsk(prompt);
    }
  },

  _handleGreeting: async (user, session) => {
    const prompt = responseService.buildPrompt({
      user,
      session,
      message: "",
      etapa: "saludo",
      extraContext: "Genera un saludo inicial cálido y breve para iniciar la sesión de lectura."
    });
    
    const saludo = await safeAsk(prompt);
    await stateService.updateStage(session, 'diagnostico');
    return responseService.formatResponse(user, saludo);
  },

  _handleDiagnostic: async (user, session, message) => {
    const missingFields = stateService.getMissingFields(user, session, 'diagnostico');
    
    if (missingFields.length > 0) {
      return await module.exports._handleMissingField(user, session, message, missingFields[0]);
    } else {
      await stateService.updateStage(session, 'exploracion');
      const prompt = responseService.buildPrompt({
        user,
        session,
        message,
        etapa: 'transicion',
        extraContext: 'Transición natural a la etapa de exploración después de completar el diagnóstico.'
      });
      return await safeAsk(prompt);
    }
  },

  _handleMissingField: async (user, session, message, field) => {
    if (field === 'PROGRESO_LIBRO') {
      // 1. Pedir a Gemini que estime el avance
      const estimado = await progressEstimationService.estimateProgress({
        libro: session.LIBRO_ACTUAL,
        descripcion: message
      });
      if (typeof estimado === 'number' && estimado > 0) {
        session.PROGRESO_LIBRO = estimado;
        await session.save();
        // Avanzar de etapa y transición cálida
        await stateService.updateStage(session, 'exploracion');
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'transicion',
          extraContext: `El usuario ya indicó su avance en el libro. Haz una transición cálida y breve a la exploración, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      } else {
        // Gemini no pudo estimar el avance, pedirle a Gemini que genere una repregunta cálida y natural
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'diagnostico',
          extraContext: `El usuario respondió de forma ambigua o no dio suficiente información sobre su avance en el libro. Pídele de forma cálida y natural que explique un poco más por dónde va en la historia, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      }
    }
    const validation = await fieldValidationService.validateField({
      campo: field,
      mensaje: message,
      user,
      session
    });

    if (validation.startsWith('SI:')) {
      const value = validation.split(':')[1].trim();
      await module.exports._updateFieldData(user, session, field, value);

      if (field === 'LIBRO_ACTUAL') {
        return module.exports._handleBookResponse(user, session, message, value);
      }

      const remainingFields = stateService.getMissingFields(user, session, 'diagnostico');
      if (remainingFields.length > 0) {
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'diagnostico',
          extraContext: `El usuario respondió: "${message}". Pide el dato "${remainingFields[0]}" de forma cálida, breve y personalizada, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      } else {
        await stateService.updateStage(session, 'exploracion');
        const prompt = responseService.buildPrompt({
          user,
          session,
          message,
          etapa: 'transicion',
          extraContext: `Todos los datos del diagnóstico están completos. Haz una transición cálida y breve a la exploración, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
        });
        return await safeAsk(prompt);
      }
    } else {
      const prompt = responseService.buildPrompt({
        user,
        session,
        message,
        etapa: 'diagnostico',
        extraContext: `El usuario respondió de forma creativa o ambigua: "${message}". Pide el dato "${field}" de forma cálida, breve y personalizada, usando el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
      });
      return await safeAsk(prompt);
    }
  },

  _updateFieldData: async (user, session, field, value) => {
    switch (field) {
      case 'EDAD':
        user.EDAD = parseInt(value);
        await user.save();
        break;
      case 'NOMBRE':
        user.NOMBRE = value;
        await user.save();
        break;
      case 'LIBRO_ACTUAL':
        session.LIBRO_ACTUAL = value;
        await session.save();
        break;
      case 'PROGRESO_LIBRO':
        const estimado = await progressEstimationService.estimateProgress({
          libro: session.LIBRO_ACTUAL,
          descripcion: value
        });
        session.PROGRESO_LIBRO = estimado || 0;
        await session.save();
        break;
    }
  },

  // sessionManagerService.js
_handleBookResponse: async (user, session, message, bookTitle) => {
  // Consultar a Gemini para identificar libro desde descripción
  const libroIdentificado = await fieldValidationService.validateField({
    campo: 'LIBRO_ACTUAL',
    mensaje: message,
    user,
    session
  });

  if (libroIdentificado.startsWith('SI:')) {
    const tituloLibro = libroIdentificado.split(':')[1];
    session.LIBRO_ACTUAL = tituloLibro;
    await session.save();
    
    // Preguntar progreso inmediatamente
    return responseService.buildPrompt({
      user,
      session,
      message,
      etapa: 'diagnostico',
      extraContext: `Libro confirmado: "${tituloLibro}". Pregunta por el progreso`
    });
  }
  
  // Si no se identifica, pedir más detalles
  return `¡Interesante! ¿Podrías darme más detalles sobre el libro?`;
},

  _handleExploration: async (user, session, message) => {
    // Inicializar preguntas de exploración si no existen
    if (!session._exploracionPreguntas) session._exploracionPreguntas = [];
    const preguntasDisponibles = stateService.initExplorationQuestions(session);

    // Si quedan preguntas por hacer
    if (preguntasDisponibles && preguntasDisponibles.length > session._exploracionPreguntas.length) {
      // Elegir una pregunta que no se haya hecho
      const siguientePregunta = preguntasDisponibles.find(p => !session._exploracionPreguntas.includes(p));
      const prompt = responseService.buildPrompt({
        user,
        session,
        message,
        etapa: 'exploracion',
        extraContext: `Genera una pregunta cálida, breve y diferente sobre el libro, evitando repeticiones. Pregunta sugerida: "${siguientePregunta}". Usa el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
      });
      const pregunta = await safeAsk(prompt);
      session._exploracionPreguntas.push(siguientePregunta);
      await session.save();
      return responseService.formatResponse(user, pregunta, { isQuestion: true });
    } else {
      // Si ya no hay preguntas, transición cálida a actividad
      await stateService.updateStage(session, 'actividad');
      const prompt = responseService.buildPrompt({
        user,
        session,
        message,
        etapa: 'transicion',
        extraContext: `Transición cálida y breve a la etapa de actividad después de la exploración. Usa el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
      });
      return await safeAsk(prompt);
    }
  },

  _handleActivity: async (user, session, message) => {
    await stateService.updateStage(session, 'reflexion');
    const prompt = responseService.buildPrompt({
      user,
      session,
      message,
      etapa: 'actividad',
      extraContext: `Propón una actividad breve y divertida relacionada con el libro y el progreso del usuario. Motiva de forma cálida y personalizada. Usa el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
    });
    return await safeAsk(prompt);
  },

  _handleReflection: async (user, session, message) => {
    await stateService.updateStage(session, 'cierre');
    const prompt = responseService.buildPrompt({
      user,
      session,
      message,
      etapa: 'reflexion',
      extraContext: `Haz una pregunta de reflexión breve y cálida sobre lo aprendido en el libro. Usa el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
    });
    return await safeAsk(prompt);
  },

  _handleClosing: async (user, session, message) => {
    const prompt = responseService.buildPrompt({
      user,
      session,
      message,
      etapa: 'cierre',
      extraContext: `Despídete de forma cálida, breve y motiva al usuario a seguir leyendo. Usa el historial:\n${getShortHistory(session.MENSAJES, 4, user)}`
    });
    return await safeAsk(prompt);
  }
};