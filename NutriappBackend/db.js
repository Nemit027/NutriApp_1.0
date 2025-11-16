require('dotenv').config(); // Carga las variables del archivo .env
const { Pool } = require('pg'); // Importa el "traductor" de PostgreSQL

// Crea la conexión
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Exporta una función para que otros archivos puedan hacer consultas
module.exports = {
  query: (text, params) => pool.query(text, params),
};