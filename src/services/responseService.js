// responseService.js
module.exports = {
  buildPrompt: ({ user, session, message, etapa, extraContext = '' }) => {
    const params = `[Parámetros actuales: Comprensión ${session.COMPRENSION}, Emoción ${session.EMOCION}, Motivación ${session.MOTIVACION}]`;
    
    return `
      Eres Lecti, un asistente de lectura para niños de ${user.EDAD || 'X'} años.
      Usuario: ${user.NOMBRE || 'niño'} | Libro: "${session.LIBRO_ACTUAL || 'un libro'}" (${session.PROGRESO_LIBRO || 0}%)
      ${params}
      Etapa: ${etapa} | Objetivo: ${session.OBJETIVO_SESION || 'fomentar la lectura'}
      Intereses: ${user.INTERESES?.join(', ') || 'no especificados'}
      ${extraContext}
      Instrucciones:
      1. Sé breve (1-2 oraciones máximo).
      2. Adapta el lenguaje a la edad del usuario.
      3. Mantén un tono ${this.getTone(session)}.
      4. ${this.getStageInstruction(etapa)}
      Último mensaje del usuario: "${message}"
      Respuesta:`.replace(/\n\s+/g, '\n').trim();
  },

  getTone: (session) => {
    if (session.EMOCION === 'baja') return 'empático y motivador';
    if (session.MOTIVACION === 'baja') return 'entusiasta y alentador';
    return 'amigable y positivo';
  },

  getStageInstruction: (etapa) => {
    switch (etapa) {
      case 'diagnostico': return 'Haz solo UNA pregunta clara y simple.';
      case 'exploracion': return 'Haz una pregunta o comentario sobre el libro.';
      case 'actividad': return 'Realiza la actividad sugerida de forma divertida.';
      default: return '';
    }
  },

  formatResponse: (user, text, options = {}) => {
    return text;
  }
};