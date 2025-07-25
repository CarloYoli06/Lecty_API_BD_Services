// activityService.js
const stateService = require('./stateService');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');

const ACTIVIDADES = {
  emocion: [
    {
      tipo: 'chiste_tematico',
      prompt: (libro) => `Genera un chiste breve y apropiado para niños sobre un personaje o situación de "${libro}" (sin referencias personales).`
    },
    {
      tipo: 'juego_rol_historico',
      prompt: (libro) => `Pregunta: "Si fueras un personaje de '${libro}' en esta escena, ¿qué emoción crees que sentirías?" (sin pedir detalles personales).`
    },
    {
      tipo: 'imaginacion_creativa',
      prompt: (libro) => `Propón imaginar un objeto mágico que podría existir en el mundo de "${libro}" (ej: "¿Qué poder tendría un amuleto en esta historia?").`
    },
    {
      tipo: 'anecdota_historica',
      prompt: (libro) => `Cuenta una curiosidad breve sobre el autor o cómo se escribió "${libro}" (ej: "¿Sabías que...?").`
    }
  ],
  motivacion: [
    {
      tipo: 'reto_no_personal',
      prompt: (libro, progreso) => `Propón un reto como: "Intenta adivinar qué hará el protagonista en la próxima página de '${libro}'".`
    },
    {
      tipo: 'pregunta_intriga',
      prompt: (libro) => `Haz una pregunta neutra sobre la trama: "¿Qué crees que pasaría si [personaje] descubre el secreto de...?".`
    },
    {
      tipo: 'reconocimiento_logro',
      prompt: (libro) => `Felicita por el progreso: "¡Llegaste al ${progreso}%! ¿Te ha gustado algo especial de esta parte?" (pregunta opcional).`
    },
    {
      tipo: 'conexion_universal',
      prompt: (libro) => `Pregunta neutra: "¿Qué emoción crees que sentiría cualquier niño en la escena de...?" (sin mencionar al usuario).`
    }
  ],
  comprension: [
    {
      tipo: 'pregunta_escena',
      prompt: (libro) => `Pregunta sobre una escena concreta: "¿Qué decidió [personaje] cuando pasó...?"`
    },
    {
      tipo: 'resumen_breve',
      prompt: (libro) => `Pide resumir solo un elemento: "En una palabra, ¿cómo describirías el lugar donde ocurre esta parte?"`
    },
    {
      tipo: 'prediccion_objetiva',
      prompt: (libro) => `Pide predecir basado en pistas: "Según lo que hizo [personaje], ¿qué crees que pasará después?"`
    },
    {
      tipo: 'analisis_personaje',
      prompt: (libro) => `Pregunta sobre roles: "¿Por qué crees que [antagonista] actúa así?"`
    }
  ],
  general: [
    {
      tipo: 'pregunta_abierta',
      prompt: (libro) => `Haz una pregunta general sobre "${libro}": "¿Qué parte te ha sorprendido más hasta ahora?" (respuesta opcional).`
    },
    {
      tipo: 'comparacion_literaria',
      prompt: (libro) => `Compara con otros libros: "Este momento de '${libro}' me recuerda a [otro libro infantil], ¿tú qué opinas?"`
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
    5. La COMPRENSIÓN del niño sobre el libro
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