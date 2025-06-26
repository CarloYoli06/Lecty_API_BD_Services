const { formatResponse } = require('./responseService');

module.exports = {
  generateMotivationalMessage: (emotion, progress, user) => {
    const messages = {
      sad: [
        `Cada página que lees te hace más fuerte`,
        `Los buenos momentos en el libro están por venir`
      ],
      neutral: [
        `Vas muy bien con tu lectura`,
        `¡Sigue explorando la historia!`
      ],
      happy: [
        `¡Se nota que te encanta este libro!`,
        `Tu entusiasmo es contagioso`
      ]
    };
    const base = messages[emotion] || messages.neutral;
    const text = base[Math.floor(Math.random() * base.length)];
    return formatResponse(user, text, { addMotivation: false });
  }
};