exports.generateEmpatheticResponse = (message, edad) => {
  // Aquí podrías adaptar el lenguaje según la edad
  if (edad < 8) return `¡Qué bonito lo que dices! 😊`;
  return `Entiendo cómo te sientes. ¡Gracias por compartirlo!`;
};