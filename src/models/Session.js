const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  IDM: String,
  CONTENIDO: String,
  EMISOR: String,
  FECHA_HORA: Date,
  EMOCION: String
});

const sessionSchema = new mongoose.Schema({
  US_ID: { type: String, required: true },
  SESSION_ID: { type: String, required: true, unique: true },
  ESTADO_ANIMO: String,
  LIBRO_ACTUAL: String,
  PROGRESO_LIBRO: Number,
  EMOCION_GENERAL: String,
  FECHA_INICIO: Date,
  FINALIZADA: Boolean,
  MENSAJES: [messageSchema],
  ETAPA_ACTUAL: { type: String, default: 'saludo' }, // NUEVO: etapa de la sesión
  OBJETIVO_SESION: String // NUEVO: objetivo/meta de la sesión
});

module.exports = mongoose.model('Session', sessionSchema);