// activityService.js
const stateService = require('./stateService');
const { safeAsk } = require('./geminiWrapper');
const User = require('../models/User');

const ACTIVIDADES = {
  // Actividades para mejorar la emoción y el disfrute
  emocion: [
    {
      tipo: 'chiste_libro',
      prompt: (libro, progreso) => `Genera un chiste breve y divertido sobre un personaje o una situación del libro "${libro}".`
    },
    {
      tipo: 'juego_rol',
      prompt: (libro, progreso) => `Imagina que eres el personaje principal de "${libro}". ¿Qué es lo más valiente o divertido que harías a continuación?`
    },
    {
      tipo: 'dato_curioso',
      prompt: (libro, progreso) => `Busquemos un dato curioso relacionado con el tema principal de "${libro}". Por ejemplo, si es sobre piratas, ¡algo sobre barcos famosos!`
    },
    {
      tipo: 'describe_personaje',
      prompt: (libro, progreso) => `Si tuvieras que describir a tu personaje favorito de "${libro}" usando solo tres palabras divertidas, ¿cuáles serían?`
    },
    {
      tipo: 'sonido_historia',
      prompt: (libro, progreso) => `Si pudieras agregar un sonido a la última parte que leíste de "${libro}", ¿qué sonido sería y por qué?`
    }
  ],
  // Actividades para mantener al niño enganchado con la historia
  motivacion: [
    {
      tipo: 'reto_lectura',
      prompt: (libro, progreso) => `Te propongo un reto: en la próxima página que leas de "${libro}", encuentra una palabra que describa una emoción. ¿Cuál será?`
    },
    {
      tipo: 'pregunta_intrigante',
      prompt: (libro, progreso) => `Basado en el ${progreso}% que has leído de "${libro}", ¿qué crees que es lo más inesperado que podría pasarle al protagonista?`
    },
    {
      tipo: 'medalla_virtual',
      prompt: (libro, progreso) => `¡Felicidades por llegar al ${progreso}% de "${libro}"! Te has ganado la "Medalla del Lector Avanzado". ¡Sigue así!`
    },
    {
      tipo: 'crea_titulo_alternativo',
      prompt: (libro, progreso) => `Si tuvieras que ponerle un nuevo título a "${libro}" basado en lo que ha pasado hasta ahora, ¿cuál sería?`
    },
    {
      tipo: 'secreto_personaje',
      prompt: (libro, progreso) => `Imaginemos que un personaje de "${libro}" tiene un secreto. ¿Cuál podría ser el secreto más sorprendente?`
    }
  ],
  // Actividades para reforzar lo que el niño ha entendido
  comprension: [
    {
      tipo: 'pregunta_clave',
      prompt: (libro, progreso) => `Sobre lo último que leíste en "${libro}", ¿cuál fue la decisión más importante que tomó un personaje?`
    },
    {
      tipo: 'resumen_emoji',
      prompt: (libro, progreso) => `Resume la última parte que leíste de "${libro}" usando solo tres emojis. ¡A ver si adivino!`
    },
    {
      tipo: 'prediccion_logica',
      prompt: (libro, progreso) => `Basado en las pistas del libro, ¿qué crees que pasará en el siguiente capítulo de "${libro}"?`
    },
    {
      tipo: 'dibuja_escena',
      prompt: (libro, progreso) => `Describe con palabras la escena más emocionante o colorida que te imaginaste al leer "${libro}" para que yo también pueda verla.`
    },
    {
        tipo: 'personajes_decision',
        prompt: (libro, progreso) => `Si los personajes de "${libro}" pudieran pedir un deseo ahora mismo, ¿qué crees que pedirían?`
    }
  ],
  // Actividades generales para conversar sobre la lectura
  general: [
    {
      tipo: 'pregunta_exploratoria',
      prompt: (libro, progreso, historial) => `Pensando en "${libro}" (leído al ${progreso}%), ¿qué es lo que más te ha sorprendido de la historia hasta ahora?`
    },
    {
      tipo: 'mensaje_libro',
      prompt: (libro) => `¿Cuál crees que es la lección o el mensaje más importante que el libro "${libro}" nos intenta enseñar?`
    },
    {
        tipo: 'palabra_magica',
        prompt: (libro, progreso) => `De todo lo que has leído en "${libro}", ¿qué palabra te parece la más bonita o interesante y por qué?`
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

    Y las siguientes actividades disponibles, enfocadas únicamente en el libro:
    ${activitiesDescription}

    Selecciona la actividad más apropiada considerando:
    1. La edad e intereses del niño.
    2. El estado emocional y nivel de motivación actual.
    3. El progreso en el libro y el contexto reciente.
    4. El objetivo de mejorar ${activityType} sin hacer preguntas personales.
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