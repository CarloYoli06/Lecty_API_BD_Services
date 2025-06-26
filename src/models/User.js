const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  US_ID: { type: String, required: true, unique: true },
  NOMBRE: String,
  NOMBRE_P: String,
  SEXO: String,
  EDAD: Number,
  USUARIO: String,
  CONTRASEÑA: String,
  FECHA_REGISTRO: Date,
  INTERESES: [String],
  AVATAR: String,
  ESCENARIO: String,
  emotional_history: [
    {
      fecha: Date,
      emocion_principal: String,
      intensidad: Number
    }
  ]
});

module.exports = mongoose.model('User', userSchema);