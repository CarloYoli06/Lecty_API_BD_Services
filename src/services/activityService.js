exports.suggestActivity = (type, session) => {
  if (type === 'chiste') {
    return `¿Quieres escuchar un chiste sobre "${session.LIBRO_ACTUAL}"?`;
  }
  if (type === 'pregunta') {
    return `¿Qué opinas del personaje principal de "${session.LIBRO_ACTUAL}"?`;
  }
  return null;
};