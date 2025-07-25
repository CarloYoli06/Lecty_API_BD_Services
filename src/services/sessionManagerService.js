const stateService = require('./stateService');
const activityService = require('./activityService');
const progressEstimationService = require('./progressEstimationService');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');
const Session = require('../models/Session');
const fieldValidationService = require('./fieldValidationService');
// En sessionManagerService.js
async function saveMessage(session, contenido, emisor = 'ia', emocion = null) {
  // Verificar si el mensaje ya existe (compara contenido, emisor y tiempo)
  const existingMessage = session.MENSAJES.find(m => 
    m.CONTENIDO.trim() === contenido.trim() && 
    m.EMISOR === emisor && 
    Math.abs(new Date() - m.FECHA_HORA) < 2000 // Mensajes dentro de 2 segundos
  );
  
  if (existingMessage) {
    console.log('Mensaje duplicado evitado:', contenido);
    return existingMessage;
  }

  const newMessage = {
    IDM: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    CONTENIDO: contenido,
    EMISOR: emisor,
    FECHA_HORA: new Date(),
    EMOCION: emocion || session.PARAMETROS_ACTUALES?.emocion || 'media'
  };
  
  session.MENSAJES.push(newMessage);
  await session.save();
  return newMessage;
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

    // Actualizar parámetros de la sesión
    await stateService.updateSessionParameters(session, message);

    // Manejar según etapa actual
    switch (session.ETAPA_ACTUAL) {
  case 'saludo':
    return await module.exports._handleGreeting(user, session,message);
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

_handleGreeting: async (user, session, message) => {
  const params = session.PARAMETROS_ACTUALES;
  const context = session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join(' | ');
  let prompt;

  // Si emoción o motivación están bajas, quedarse en bucle motivacional
  if (params.emocion === 'baja' || params.emocion === 'negativa' || params.motivacion === 'baja') {
    prompt = `
      Eres un asistente de lectura para niños.
      El usuario se siente triste o desmotivado.
      Nombre: ${user.NOMBRE || 'niño'}, Edad: ${user.EDAD || 'X'}
      Contexto reciente: ${context}
      Su último mensaje fue: "${message}"
      Da un saludo cálido y empático, reconociendo cómo se siente el usuario y motivándolo suavemente.
      No repitas literalmente los mensajes anteriores.
    `;
    const saludo = await safeAsk(prompt);
    await saveMessage(session, saludo, 'agente');
    // NO avanzar de etapa, quedarse en saludo hasta que mejore el estado emocional/motivacional
    return saludo;
  } else {
    prompt = `
      Eres un asistente de lectura para niños.
      Nombre: ${user.NOMBRE || 'niño'}, Edad: ${user.EDAD || 'X'}
      Contexto reciente: ${context}
      Su último mensaje fue: "${message}"
      Da un saludo cálido, motivador y breve para iniciar la conversación.
      No repitas literalmente los mensajes anteriores.
    `;
    const saludo = await safeAsk(prompt);
    await saveMessage(session, saludo, 'agente');
    // Ahora sí avanza a diagnóstico
    await stateService.updateStage(session, 'diagnostico',message);
    return saludo;
  }
},


  _handleDiagnostic: async (user, session, message) => {
    const params = session.PARAMETROS_ACTUALES;
    const context = session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join(' | ');

    // 1. Si emoción es negativa o motivación baja, PAUSAR diagnóstico
    if (params.emocion === 'negativa') {
      const activityPrompt = activityService.getActivityPrompt(session);
      const prompt = `
        Eres un asistente de lectura para niños.
        Nombre: ${user.NOMBRE || 'niño'}, Edad: ${user.EDAD || 'X'}
        Libro actual: ${session.LIBRO_ACTUAL || 'no especificado'}
        Progreso: ${session.PROGRESO_LIBRO || 0}%
        Intereses: ${user.INTERESES?.join(', ') || 'no especificados'}
        Contexto reciente: ${context}
        El usuario muestra una emoción negativa o baja motivación.
        ${activityPrompt}
        Da una respuesta empática y breve, enfocada en mejorar el ánimo. No repitas literalmente los mensajes anteriores.
      `;
      const respuesta = await safeAsk(prompt);
      await saveMessage(session, respuesta, 'agente');
      return respuesta;
    }

    // 2. Prioridad: datos personales
    const missingFields = await stateService.getMissingFields(user, session);
    if (missingFields.includes('NOMBRE')) {
      const prompt = `
        Contexto reciente: ${context}
        El usuario aún no ha proporcionado su nombre.
        Su último mensaje fue: "${message}"
        Pregunta de forma cálida y natural cómo se llama, sin repetir literalmente los mensajes anteriores.
      `;
      const respuesta = await safeAsk(prompt);
      await saveMessage(session, respuesta, 'agente');
      return respuesta;
    }
    if (missingFields.includes('EDAD')) {
      const prompt = `
        Contexto reciente: ${context}
        El usuario aún no ha proporcionado su edad.
        Su último mensaje fue: "${message}"
        Pregunta de forma empática y natural cuántos años tiene, sin repetir literalmente los mensajes anteriores.
      `;
      const respuesta = await safeAsk(prompt);
      await saveMessage(session, respuesta, 'agente');
      return respuesta;
    }

    // 3. Preguntar por el libro si no se tiene
    if (!session.LIBRO_ACTUAL && !session._esperandoLibro) {
      session._esperandoLibro = true;
      await session.save();
      const prompt = `
        Contexto reciente: ${context}
        El usuario ya proporcionó su nombre y edad.
        Su último mensaje fue: "${message}"
        Pregunta de forma natural y motivadora qué libro está leyendo actualmente, para poder conversar sobre él.
        No repitas literalmente los mensajes anteriores.
      `;
      const respuesta = await safeAsk(prompt);
      await saveMessage(session, respuesta, 'agente');
      return respuesta;
    }

    // 4. Validar la respuesta del usuario como posible libro
    if (!session.LIBRO_ACTUAL && session._esperandoLibro) {
      const validation = await fieldValidationService.validateField({
        campo: 'LIBRO_ACTUAL',
        mensaje: message,
        user,
        session
      });
      if (validation.startsWith("SI:")) {
        const libroDetectado = validation.split(":")[1]?.trim();
        if (libroDetectado && libroDetectado.toLowerCase() !== 'no') {
          session.LIBRO_ACTUAL = libroDetectado;
          session._esperandoLibro = false;
          session._libroSugerido = undefined;
          await session.save();
          const prompt = `
            Contexto reciente: ${context}
            El usuario ha indicado que está leyendo "${session.LIBRO_ACTUAL}".
            Su último mensaje fue: "${message}"
            Pregunta de forma natural y breve por el avance o la parte del libro en la que va, para conocer mejor su experiencia.
            No repitas literalmente los mensajes anteriores.
          `;
          const respuesta = await safeAsk(prompt);
          await saveMessage(session, respuesta, 'agente');
          return respuesta;
        }
      }
      // Si no se detectó un libro claro, intentar adivinar el libro a partir de la descripción
      const guessPrompt = `
        El usuario respondió: "${message}"
        Según esta descripción, ¿a qué libro infantil conocido podría referirse?
        Responde SOLO con el título exacto entre comillas si tienes una alta probabilidad, o "NO" si no puedes adivinar con certeza.
      `;
      const guess = await safeAsk(guessPrompt);
      if (guess && guess.startsWith('"') && guess.endsWith('"')) {
        const libroAdivinado = guess.replace(/"/g, '').trim();
        // Preguntar al usuario si es ese libro
        session._libroSugerido = libroAdivinado;
        await session.save();
        const confirmPrompt = `
          Contexto reciente: ${context}
          El usuario describió el libro como: "${message}"
          ¿Te refieres al libro "${libroAdivinado}"? Responde sí o no, por favor.
          No repitas literalmente los mensajes anteriores.
        `;
        const respuesta = await safeAsk(confirmPrompt);
        await saveMessage(session, respuesta, 'agente');
        return respuesta;
      } else {
        // Si no se puede adivinar, repreguntar normalmente
        const prompt = `
          Contexto reciente: ${context}
          El usuario intentó decir el libro pero no fue claro.
          Su último mensaje fue: "${message}"
          Pídele de forma amable y motivadora que especifique el título exacto del libro que está leyendo.
          No repitas literalmente los mensajes anteriores.
        `;
        const respuesta = await safeAsk(prompt);
        await saveMessage(session, respuesta, 'agente');
        return respuesta; 
      }
    }
    // 4b. Confirmar libro sugerido si existe
    if (!session.LIBRO_ACTUAL && session._libroSugerido) {
      // Si el usuario responde afirmativamente, asignar el libro sugerido
      const confirmValidation = await fieldValidationService.validateField({
        campo: 'CONFIRMACION_LIBRO',
        mensaje: message,
        user,
        session
      });
      if (confirmValidation.toLowerCase().includes('si')) {
        session.LIBRO_ACTUAL = session._libroSugerido;
        session._libroSugerido = undefined;
        session._esperandoLibro = false;
        await session.save();
        const prompt = `
          Contexto reciente: ${context}
          ¡Perfecto! Ahora sé que estás leyendo "${session.LIBRO_ACTUAL}".
          Su último mensaje fue: "${message}"
          Pregunta de forma natural y breve por el avance o la parte del libro en la que va, para conocer mejor su experiencia.
          No repitas literalmente los mensajes anteriores.
        `;
        const respuesta = await safeAsk(prompt);
        await saveMessage(session, respuesta, 'agente');
        return respuesta;
      } else {
        // Si no, limpiar sugerencia y volver a preguntar
        session._libroSugerido = undefined;
        await session.save();
        const prompt = `
          Contexto reciente: ${context}
          El usuario negó la sugerencia de libro.
          Su último mensaje fue: "${message}"
          Pídele de forma amable y motivadora que especifique el título exacto del libro que está leyendo.
          No repitas literalmente los mensajes anteriores.
        `;
        const respuesta = await safeAsk(prompt);
        await saveMessage(session, respuesta, 'agente');
        return respuesta;
      }
    }

    // 5. Preguntar por el progreso si falta
    if (!session.PROGRESO_LIBRO|| session.PROGRESO_LIBRO <= 0) {
      const progress = await progressEstimationService.estimateProgress({
        libro: session.LIBRO_ACTUAL,
        descripcion: message
      });
      if (progress !== null && progress !== 0) {
      session.PROGRESO_LIBRO = progress;
      await session.save();
      
      // Si tenemos toda la información necesaria, avanzar directamente a exploración
      const missingFields = await stateService.getMissingFields(user, session);
      if (missingFields.length === 0) {
        await session.save();
        await stateService.updateStage(session, 'exploracion', message); // Pasar el mensaje actual
        const context = session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join(' | ');
        const transitionPrompt = `Contexto: ${context}. Genera un mensaje para comenzar a explorar
        de forma coherente "${session.LIBRO_ACTUAL}". No repitas literalmente los mensajes anteriores.
        edad: ${user.EDAD || 'X'}, nombre: ${user.NOMBRE || 'niño'}`;
        const transitionMessage = await safeAsk(transitionPrompt);
        await saveMessage(session, transitionMessage, 'agente');
        return transitionMessage;
      }
    } else {
        const prompt = `
          eres un asistente de lectura para niños.
          Nombre: ${user.NOMBRE || 'niño'}, Edad: ${user.EDAD || 'X'}
          Contexto reciente: ${context}
          El usuario ya indicó el libro: "${session.LIBRO_ACTUAL}".
          Su último mensaje fue: "${message}"
          ultimos mensajes:${context}
          Pregunta de forma natural y motivadora por el avance o la parte del libro en la que va.
          No repitas literalmente los mensajes anteriores.se breve y natural.
        `;
        const respuesta = await safeAsk(prompt);
        await saveMessage(session, respuesta, 'agente');
        return respuesta;
      }
    }

    // 6. Transición a exploración si ya tenemos toda la info
    await stateService.updateStage(session, 'exploracion');
    const transitionPrompt = `Contexto: ${context}. Genera un mensaje para comenzar a explorar "${session.LIBRO_ACTUAL}". No repitas literalmente los mensajes anteriores.`;
    const transitionMessage = await safeAsk(transitionPrompt);
    await saveMessage(session, transitionMessage, 'agente');
    return transitionMessage;
  },

_handleExploration: async (user, session, message) => {
    const params = session.PARAMETROS_ACTUALES;
    const progressContext = activityService.getProgressContext(session);
    const lastMessages = session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join('\n');
    
    // Si la emoción o motivación están bajas, usar el sistema de actividades
    if (params.emocion === 'negativa' || params.motivacion === 'baja') {
      const activityPrompt = await activityService.getActivityPrompt(session);
      const responsePrompt = `
        Contexto del usuario:
        - Nombre: ${user.NOMBRE}, Edad: ${user.EDAD}
        - Libro: "${session.LIBRO_ACTUAL}" (${session.PROGRESO_LIBRO}%)
        - Estado: ${params.emocion === 'negativa' ? 'emocionalmente bajo' : 'poco motivado'}
        
        Últimos mensajes:
        ${lastMessages}
        
        Actividad sugerida:
        ${activityPrompt}
        
        Genera una respuesta empática y motivadora que integre la actividad sugerida.
      `;
      
      const response = await safeAsk(responsePrompt);
      await saveMessage(session, response, 'agente');
      return response;
    }
    
    // Exploración normal con foco en el libro
    const explorationPrompt = `
      Contexto del usuario:
      - Nombre: ${user.NOMBRE}, Edad: ${user.EDAD}
      - Libro: "${session.LIBRO_ACTUAL}" (${session.PROGRESO_LIBRO}%)
      - Intereses: ${user.INTERESES?.join(', ') || 'no especificados'}
      ${progressContext}
      
      Últimos mensajes:
      ${lastMessages}
      
      Objetivo: Profundizar en la comprensión y disfrute del libro
      
      Genera una pregunta o comentario que:
      1. Sea relevante para la parte del libro que está leyendo
      2. Fomente la reflexión o conexión personal
      3. Mantenga el interés en la historia
      4. Sea apropiado para su edad
      
      La respuesta debe ser breve (1-2 oraciones) y natural.
    `;
    
    const explorationMessage = await safeAsk(explorationPrompt);
    await saveMessage(session, explorationMessage, 'agente');
    
    // Solo transicionar si se cumplen las condiciones
    if (await stateService.shouldTransitionToNextStage(session)) {
      await stateService.updateStage(session, 'actividad');
    }
    
    return explorationMessage;
},

  _handleActivity: async (user, session, message) => {
    const params = session.PARAMETROS_ACTUALES;
    const lastMessages = session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join('\n');
// Obtener actividad personalizada
    const activityPrompt = await activityService.getActivityPrompt(session);
    const previousSession = await Session.findOne({
      US_ID: session.US_ID,
      LIBRO_ACTUAL: session.LIBRO_ACTUAL,
      SESSION_ID: { $ne: session.SESSION_ID },
      PROGRESO_LIBRO: { $gt: 0 }
    }).sort({ FECHA_CREACION: -1 });
    //contexto previo de sesion pasada
    let previousSummary = '';
    if (previousSession) {
      previousSummary = `
        Información de la sesión anterior:
        - Progreso anterior: ${previousSession.PROGRESO_LIBRO}%
        - Resumen anterior: ${previousSession.RESUMEN_SESION || 'Sin resumen'}
        Puedes hacer referencia a lo que el usuario había leído antes, comparar avances o motivarlo usando su progreso anterior.
      `;
    }
    const promptContext = `
      Contexto del usuario:
      - Nombre: ${user.NOMBRE}, Edad: ${user.EDAD}
      - Libro: "${session.LIBRO_ACTUAL}" (${session.PROGRESO_LIBRO}%)
      - Intereses: ${user.INTERESES?.join(', ') || 'no especificados'}
      - Estado emocional: ${params.emocion}
      - Nivel de motivación: ${params.motivacion}
      - Comprensión: ${params.comprension}
      ${previousSummary}

      Últimos mensajes:
      ${lastMessages}

      Actividad sugerida:
      ${activityPrompt}

      Genera una respuesta que:
      1. Introduzca la actividad de forma divertida y natural
      2. Sea apropiada para la edad del niño
      3. Conecte con sus intereses y estado emocional
      4. Si es posible, haz referencia a lo que el usuario había leído antes o a su progreso anterior
      5. Fomente la participación activa

      La respuesta debe ser breve y entusiasta.
    `;
    
    const activityMessage = await safeAsk(promptContext);
    await saveMessage(session, activityMessage, 'agente');
    // Evaluar transición usando el nextStage correcto
    const transitionResult = await stateService.shouldTransitionToNextStage(session, message);
    if (transitionResult.shouldTransition) {
      await stateService.updateStage(session, transitionResult.nextStage, message);
    }
    return activityMessage;
  },

  _handleClosing: async (user, session, message) => {
    const params = session.PARAMETROS_ACTUALES;
    const lastMessages = session.MENSAJES.slice(-5).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join('\n');
    const progressHistory = session.HISTORIAL_AVANCE
      .filter(h => h.libro === session.LIBRO_ACTUAL)
      .map(h => `${new Date(h.fecha).toLocaleDateString()}: ${h.avanceActual}%`)
      .join('\n');
    
    // Generar resumen de la sesión
    const summaryPrompt = `
      Analiza esta sesión de lectura:
      
      Usuario: ${user.NOMBRE} (${user.EDAD} años)
      Libro: "${session.LIBRO_ACTUAL}"
      Progreso actual: ${session.PROGRESO_LIBRO}%
      
      Historial de progreso:
      ${progressHistory}
      
      Últimas interacciones:
      ${lastMessages}
      
      Genera un resumen breve (2-3 oraciones) que capture:
      1. Los aspectos más importantes discutidos
      2. El progreso o insights logrados
      3. La evolución emocional/motivacional del usuario
    `;
    
    session.RESUMEN_SESION = await safeAsk(summaryPrompt);
    
    // Generar mensaje de cierre personalizado
    const closingPrompt = `
      Contexto de cierre:
      - Usuario: ${user.NOMBRE} (${user.EDAD} años)
      - Libro actual: "${session.LIBRO_ACTUAL}" (${session.PROGRESO_LIBRO}%)
      - Estado final: ${params.emocion}, ${params.motivacion}
      - Resumen: ${session.RESUMEN_SESION}
      - Contexto reciente: ${lastMessages}
      Genera un mensaje de cierre que:
      Despidete finalizando todo pero sin perdder coherencia con la conversación
      1. Sea cálido y personal
      2. Reconozca el esfuerzo y progreso
      3. Deje una sensación positiva
      4. Motive a continuar leyendo
      5. Incluya una pequeña intriga o expectativa sobre lo que sigue
      6. Sea breve (1-2 oraciones)
    `;
    
    const closingMessage = await safeAsk(closingPrompt);
    session.FINALIZADA = true;
    await saveMessage(session, closingMessage, 'agente');
    await session.save();
    return closingMessage;
  }
};