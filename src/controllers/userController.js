const User = require('../models/User');

exports.createUser = async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findOne({ US_ID: req.params.userId });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user); // Devuelve todos los campos, incluida la contraseña
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};