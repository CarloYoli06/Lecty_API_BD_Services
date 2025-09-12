// Session.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  IDM: String,
  CONTENIDO: String,
  EMISOR: String,
  FECHA_HORA: { type: Date, default: Date.now },
  EMOCION: String,
  PARAMETROS: {
    comprension: String,
    emocion: String,
    motivacion: String
  }
});

const sessionSchema = new mongoose.Schema({
  US_ID: { type: String, required: true },
  SESSION_ID: { type: String, required: true, unique: true },
  LIBRO_ACTUAL: String,
  PROGRESO_LIBRO: Number,
  _esperandoLibro: { type: Boolean, default: false },
  _libroSugerido: String,
  FECHA_INICIO: { type: Date, default: Date.now },
  FINALIZADA: { type: Boolean, default: false },
  MENSAJES: [messageSchema],
  ETAPA_ACTUAL: { 
    type: String, 
    enum: ['saludo', 'diagnostico', 'exploracion', 'actividad', 'cierre'],
    default: 'saludo'
  },
  OBJETIVO_SESION: { type: String, default: "Fomentar el gusto por la lectura" },
  
  // Parameters tracking
  PARAMETROS_ACTUALES: {
    comprension: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
    emocion: { type: String, enum: ['positiva', 'neutra', 'negativa'], default: 'neutra' },
    motivacion: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' }
  },
  
  HISTORIAL_PARAMETROS: [{
    fecha: { type: Date, default: Date.now },
    comprension: String,
    emocion: String,
    motivacion: String
  }],
  
  HISTORIAL_AVANCE: [{
    libro: String,
    avanceAnterior: Number,
    avanceActual: Number,
    fecha: { type: Date, default: Date.now }
  }],
  
RESUMEN_SESION: { type: String, default: "" },
  ULTIMA_ACTIVIDAD: String
});

module.exports = mongoose.model('Session', sessionSchema);