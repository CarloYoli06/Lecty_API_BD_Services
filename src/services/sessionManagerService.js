const stateService = require('./stateService');
const activityService = require('./activityService');
const progressEstimationService = require('./progressEstimationService');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');
const Session = require('../models/Session');

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
  // Analizar emoción/motivación del último mensaje
  const params = session.PARAMETROS_ACTUALES;
  const context = session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join(' | ');
  let prompt;

  if (params.emocion === 'baja' || params.motivacion === 'baja') {
    // Saludo empático
    prompt = `
      Eres un asistente de lectura para niños.
      El usuario se siente triste o desmotivado.
      Nombre: ${user.NOMBRE || 'niño'}, Edad: ${user.EDAD || 'X'}
      Contexto reciente: ${context}
      Da un saludo cálido y empático, reconociendo cómo se siente el usuario y motivándolo suavemente.
      No repitas literalmente los mensajes anteriores.
    `;
  } else {
    // Saludo normal
    prompt = `
      Eres un asistente de lectura para niños.
      Nombre: ${user.NOMBRE || 'niño'}, Edad: ${user.EDAD || 'X'}
      Da un saludo cálido y motivador para iniciar la conversación.
    `;
  }

  const saludo = await safeAsk(prompt);
  await saveMessage(session, saludo, 'agente');
  await stateService.updateStage(session, 'diagnostico');
  return saludo;
},


  _handleDiagnostic: async (user, session, message) => {
    const params = session.PARAMETROS_ACTUALES;
    const context = session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join(' | ');

    // 1. Si emoción es negativa o motivación baja, PAUSAR diagnóstico
    if (params.emocion === 'negativa' || params.motivacion === 'baja') {
      let activityPrompt;
      if (params.emocion === 'negativa') {
        activityPrompt = activityService.getActivityPrompt(session);
      } else {
        activityPrompt = activityService.getActivityPrompt({ ...session, PARAMETROS_ACTUALES: { ...params, motivacion: 'baja' } });
      }

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

    // 2. Detección de libro
    if (!session.LIBRO_ACTUAL && message) {
      const bookPrompt = `El usuario (${user.EDAD} años) dijo: "${message}". ¿Menciona claramente un libro infantil conocido? Responde SOLO con el título exacto o "NO".`;
      const bookResponse = await safeAsk(bookPrompt);
      if (!bookResponse.includes("NO")) {
        session.LIBRO_ACTUAL = bookResponse.trim();
        // Guardar en historial si es nuevo libro
        session.HISTORIAL_AVANCE.push({
          libro: session.LIBRO_ACTUAL,
          avanceAnterior: 0,
          avanceActual: 0,
          fecha: new Date()
        });
        await session.save();
      }
    }

    // 3. Detección de progreso
    if (session.LIBRO_ACTUAL && !session.PROGRESO_LIBRO && message) {
      const progress = await progressEstimationService.estimateProgress({
        libro: session.LIBRO_ACTUAL,
        descripcion: message
      });
      if (progress !== null) {
        session.PROGRESO_LIBRO = progress;
        session.HISTORIAL_AVANCE.push({
          libro: session.LIBRO_ACTUAL,
          avanceAnterior: 0,
          avanceActual: progress,
          fecha: new Date()
        });
        await session.save();
      }
    }

    // 4. Preguntar por campos faltantes
    const missingFields = await stateService.getMissingFields(user, session);
    if (missingFields.length > 0) {
      const field = missingFields[0];
      const promptMap = {
        EDAD: `Nombre: ${user.NOMBRE || 'niño'}, Contexto: ${context}. Pregunta la edad del niño de forma natural y empática. Solo envía el mensaje, sin paréntesis ni comillas.`,
        NOMBRE: `Edad: ${user.EDAD || 'X'}, Contexto: ${context}. Pregunta el nombre del niño de forma cálida y empática. Solo envía el mensaje, sin paréntesis ni comillas.`,
        LIBRO_ACTUAL: `Nombre: ${user.NOMBRE || 'niño'}, Contexto: ${context}. Pregunta qué libro está leyendo el niño, de forma natural y empática. Solo envía el mensaje, sin paréntesis ni comillas.`,
        PROGRESO_LIBRO: `Nombre: ${user.NOMBRE || 'niño'}, Contexto: ${context}. Pregunta por dónde va en "${session.LIBRO_ACTUAL}". Solo envía el mensaje, sin paréntesis ni comillas.`
      };
      const question = await safeAsk(promptMap[field]);
      await saveMessage(session, question, 'agente');
      return question;
    }

    // 5. Transición a exploración si ya tenemos toda la info
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
    
    const promptContext = `
      Contexto del usuario:
      - Nombre: ${user.NOMBRE}, Edad: ${user.EDAD}
      - Libro: "${session.LIBRO_ACTUAL}" (${session.PROGRESO_LIBRO}%)
      - Intereses: ${user.INTERESES?.join(', ') || 'no especificados'}
      - Estado emocional: ${params.emocion}
      - Nivel de motivación: ${params.motivacion}
      - Comprensión: ${params.comprension}
      
      Últimos mensajes:
      ${lastMessages}
      
      Actividad sugerida:
      ${activityPrompt}
      
      Genera una respuesta que:
      1. Introduzca la actividad de forma divertida y natural
      2. Sea apropiada para la edad del niño
      3. Conecte con sus intereses y estado emocional
      4. Fomente la participación activa
      
      La respuesta debe ser breve y entusiasta.
    `;
    
    const activityMessage = await safeAsk(promptContext);
    await saveMessage(session, activityMessage, 'agente');
    
    // Evaluar si es momento de pasar a cierre
    if (await stateService.shouldTransitionToNextStage(session)) {
      await stateService.updateStage(session, 'cierre');
    } else {
      // Si no, volver a exploración para mantener el engagement
      await stateService.updateStage(session, 'exploracion');
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
      
      Genera un mensaje de cierre que:
      1. Sea cálido y personal
      2. Reconozca el esfuerzo y progreso
      3. Deje una sensación positiva
      4. Motive a continuar leyendo
      5. Incluya una pequeña intriga o expectativa sobre lo que sigue
    `;
    
    const closingMessage = await safeAsk(closingPrompt);
    session.FINALIZADA = true;
    await saveMessage(session, closingMessage, 'agente');
    await session.save();
    return closingMessage;
  }
};