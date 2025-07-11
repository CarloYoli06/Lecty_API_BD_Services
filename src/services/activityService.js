// activityService.js
const stateService = require('./stateService');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');

const ACTIVIDADES = {
  // Actividades para mejorar la emoción
  emocion: [
    {
      tipo: 'chiste',
      prompt: (libro, progreso) => `Genera un chiste breve y apropiado para niños sobre "${libro}" o sus personajes.`
    },
    {
      tipo: 'juego_rol',
      prompt: (libro, progreso) => `Invita al niño a imaginar que es uno de los personajes de "${libro}" y pregúntale qué haría en una situación divertida.`
    },
    {
      tipo: 'imaginacion',
      prompt: (libro, progreso) => `Propón un ejercicio de imaginación creativo y divertido relacionado con "${libro}", adaptado al ${progreso}% de avance.`
    },
    {
      tipo: 'anecdota',
      prompt: (libro) => `Cuenta una anécdota breve y positiva relacionada con "${libro}" que pueda hacer sonreír al niño.`
    }
  ],
  motivacion: [
    {
      tipo: 'reto',
      prompt: (libro, progreso) => `Propón un pequeño reto divertido relacionado con "${libro}" para motivar al usuario a seguir leyendo.`
    },
    {
      tipo: 'pregunta_intriga',
      prompt: (libro, progreso) => `Haz una pregunta intrigante sobre lo que podría pasar después en "${libro}" (basado en el ${progreso}% de avance).`
    },
    {
      tipo: 'premio_virtual',
      prompt: (libro, progreso) => `Felicita al niño por su progreso en "${libro}" y ofrece una "medalla virtual" o reconocimiento especial por su esfuerzo.`
    },
    {
      tipo: 'conexion_personal',
      prompt: (libro, progreso) => `Haz una pregunta que conecte los eventos de "${libro}" con experiencias personales del niño para aumentar su interés.`
    }
  ],
  comprension: [
    {
      tipo: 'pregunta_comprension',
      prompt: (libro, progreso) => `Haz una pregunta sencilla para verificar la comprensión de la parte reciente de "${libro}".`
    },
    {
      tipo: 'resumen',
      prompt: (libro, progreso) => `Pide al usuario que resuma brevemente lo que ha leído recientemente en "${libro}".`
    },
    {
      tipo: 'prediccion',
      prompt: (libro, progreso) => `Pide al niño que prediga qué podría pasar después en "${libro}" basado en lo que ha entendido hasta ahora.`
    },
    {
      tipo: 'personajes',
      prompt: (libro, progreso) => `Haz una pregunta sobre las características o acciones de los personajes en "${libro}" para evaluar la comprensión.`
    }
  ],
  general: [
    {
      tipo: 'pregunta_exploracion',
      prompt: (libro, progreso, historial) => `Haz una pregunta exploratoria (1 oración) sobre "${libro}" considerando que el usuario ya ha leído hasta el ${progreso}% y el historial previo: ${historial}.`
    },
    {
      tipo: 'conexion_personal',
      prompt: (libro) => `Pregunta (1 oración) cómo se relaciona la historia de "${libro}" con experiencias personales del usuario.`
    }
  ]
};

async function selectBestActivity(session, user, activityType) {
  const activities = ACTIVIDADES[activityType];
  if (!activities) return null;

  const context = `
    Contexto del usuario:
    - Edad: ${user.EDAD || 'desconocida'}
    - Intereses: ${user.INTERESES?.join(', ') || 'no especificados'}
    - Libro actual: ${session.LIBRO_ACTUAL}
    - Progreso: ${session.PROGRESO_LIBRO}%
    - Estado emocional: ${session.PARAMETROS_ACTUALES.emocion}
    - Nivel de motivación: ${session.PARAMETROS_ACTUALES.motivacion}
    - Nivel de comprensión: ${session.PARAMETROS_ACTUALES.comprension}
    mantyen la  conversacion coherente y breve pero amigable, 
    Últimos mensajes:
    ${session.MENSAJES.slice(-3).map(m => `${m.EMISOR}: ${m.CONTENIDO}`).join('\n')}
  `;

  const activitiesDescription = activities
    .map(a => a.tipo)
    .join(', ');

  const prompt = `
    Dado el siguiente contexto:
    ${context}

    Y las siguientes actividades disponibles:
    ${activitiesDescription}

    Selecciona la actividad más apropiada considerando:
    1. La edad y los intereses del niño
    2. El estado emocional y nivel de motivación actual
    3. El progreso en el libro y contexto reciente
    4. El objetivo de mejorar ${activityType}

    Responde SOLO con el nombre exacto de la actividad más apropiada.
  `;

  const selectedActivity = await safeAsk(prompt);
  return activities.find(a => a.tipo === selectedActivity.trim()) || activities[0];
}

module.exports = {
  getActivityPrompt: async (session) => {
    const activityType = stateService.getActivityType(session);
    const user = await User.findOne({ US_ID: session.US_ID });
    
    if (!session.LIBRO_ACTUAL) {
      return ACTIVIDADES.general[0].prompt('un libro', 0, '');
    }
    
    const bestActivity = await selectBestActivity(session, user, activityType);
    if (!bestActivity) return ACTIVIDADES.general[0].prompt(session.LIBRO_ACTUAL, session.PROGRESO_LIBRO || 0);
    
    return bestActivity.prompt(
      session.LIBRO_ACTUAL,
      session.PROGRESO_LIBRO || 0,
      session.HISTORIAL_AVANCE?.slice(-3)?.map(h => `${h.libro} (${h.avanceActual}%)`).join(', ') || ''
    );
  },

  getProgressContext: (session) => {
    if (!session.HISTORIAL_AVANCE?.length) return '';
    
    const lastProgress = session.HISTORIAL_AVANCE[session.HISTORIAL_AVANCE.length - 1];
    return `En la última sesión, el usuario leyó hasta el ${lastProgress.avanceActual}% de "${lastProgress.libro}".`;
  }
};