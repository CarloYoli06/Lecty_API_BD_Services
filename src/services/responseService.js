module.exports = {
  formatResponse: (user, text, options = {}) => {
    const { isQuestion = false, addMotivation = true } = options;
    let response = text;

    // Personalización con nombre
    if (user.NOMBRE) {
      response = response
        .replace(/(¡|¿)?\b(hola|oye|amigo|niño)\b/gi, `$1${user.NOMBRE}`)
        .replace(/(\?|!|\.)$/, `, ${user.NOMBRE}$1`);
    }

    // Añade emojis o motivación
    if (addMotivation) {
      const motivaciones = [
        " ¡Tú puedes!",
        " 😊",
        " ¡Sigue así!",
        " 📚",
        " ¡Qué emocionante!"
      ];
      const motivacion = motivaciones[Math.floor(Math.random() * motivaciones.length)];
      
      if (!response.endsWith(motivacion)) {
        response += motivacion;
      }
    }

    // Formato de pregunta
    if (isQuestion && !response.endsWith('?')) {
      response = response.replace(/\.$/, '?');
    }

    return response;
  },

  buildPrompt: ({ user, session, message, etapa, extraContext = '' }) => {
    return `
      Eres Lecti, un asistente de lectura para niños de ${user.EDAD || 'X'} años.
      Usuario: ${user.NOMBRE || 'niño'} | Libro: "${session.LIBRO_ACTUAL || 'un libro'}"
      Etapa: ${etapa} | Objetivo: ${session.OBJETIVO_SESION || 'fomentar la lectura'}
      Intereses: ${user.INTERESES?.join(', ') || 'no especificados'}
      ${extraContext}
      Instrucciones:
      1. Sé breve y claro (máximo 2 oraciones).
      2. Adapta el lenguaje a la edad del usuario.
      3. No hagas spoilers.
      4. ${etapa === 'exploracion' ? 'Haz solo UNA pregunta sobre el libro.' : ''}
      Último mensaje del usuario: "${message}"
      Respuesta:`.replace(/\n\s+/g, '\n').trim();
  }
};