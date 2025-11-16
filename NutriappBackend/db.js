require('dotenv').config(); 
const { Pool } = require('pg');

// Esta configuración es inteligente:
// 1. Le dice a 'pg' que use la URL completa (DATABASE_URL) si existe (así lo usará Render).
// 2. Si no existe, usará las variables separadas de tu .env (así lo usas tú en tu PC).
const config = {
  connectionString: process.env.DATABASE_URL,
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  // Activa SSL SÓLO si estamos en producción (cuando DATABASE_URL exista)
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
};

const pool = new Pool(config);

module.exports = {
  query: (text, params) => pool.query(text, params),
};