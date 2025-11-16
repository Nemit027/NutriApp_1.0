// 1. Importar los "ayudantes"
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
require('dotenv').config();

// 2. Crear la aplicación
const app = express();
app.use(cors());
app.use(express.json());

// 3. Middleware de Autenticación (El "Guardia")
const checkAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token || token === 'null') {
            return res.status(401).json({ error: 'No autorizado' });
        }
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// --- Función para validar la contraseña ---
const validatePassword = (password) => {
    const errors = [];
   
    // Regla 1: 7 a 12 caracteres
    if (password.length < 7 || password.length > 12) {
        errors.push('Debe tener entre 7 y 12 caracteres');
    }
    // Regla 2: Una minúscula
    if (!/[a-z]/.test(password)) {
        errors.push('Debe tener al menos una minúscula');
    }
    // Regla 3: Una mayúscula
    if (!/[A-Z]/.test(password)) {
        errors.push('Debe tener al menos una mayúscula');
    }
    // Regla 4: Un número
    if (!/\d/.test(password)) {
        errors.push('Debe tener al menos un número');
    }
    // Regla 5: Un caracter especial
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.\/]/.test(password)) {
        errors.push('Debe tener al menos un caracter especial (!@#$%&)');
    }
    
    return errors;
};

// --- NUEVA FUNCIÓN: Obtener alimento del día con explicación ---
const getFoodOfTheDay = async (user_id = null) => {
    try {
        // Seleccionar un alimento aleatorio de la base de datos
        const foodResult = await db.query(
            `SELECT f.*, 
                    CASE 
                        WHEN f.viability_weight_loss = 'muy_bueno' THEN 'Excelente para bajar de peso'
                        WHEN f.viability_muscle_gain = 'muy_bueno' THEN 'Ideal para ganar masa muscular'
                        WHEN f.viability_maintenance = 'muy_bueno' THEN 'Perfecto para mantenimiento'
                        WHEN f.kcal < 100 THEN 'Bajo en calorías, ideal para control de peso'
                        WHEN f.protein > 15 THEN 'Alto en proteínas, excelente para músculos'
                        ELSE 'Alimento nutritivo y balanceado'
                    END as benefit_reason
             FROM foods f 
             WHERE f.image_url IS NOT NULL 
             AND f.image_url != ''
             ORDER BY RANDOM() 
             LIMIT 1`
        );

        if (foodResult.rows.length === 0) {
            // Fallback si no hay alimentos
            return {
                food: {
                    food_id: 456,
                    name: "Acelga",
                    description: "1 taza (175g) de acelga cocida, sin sal.",
                    kcal: 35,
                    protein: 3.3,
                    carbs: 7,
                    fats: 0.1,
                    image_url: "https://imagenes2.eltiempo.com/files/image_1200_535/uploads/2023/05/09/645a9c00e1f42.jpeg",
                    category: "Verdura"
                },
                reason: "Excelente para la salud digestiva y rica en antioxidantes. Baja en calorías y alta en nutrientes esenciales."
            };
        }

        const food = foodResult.rows[0];
        
        // Si tenemos user_id, personalizar según metas
        let personalizedReason = food.benefit_reason;
        if (user_id) {
            const userResult = await db.query(
                "SELECT weight as current_weight, goal_weight FROM users WHERE user_id = $1",
                [user_id]
            );
            
            if (userResult.rows.length > 0) {
                const user = userResult.rows[0];
                if (user.current_weight && user.goal_weight) {
                    if (user.goal_weight < user.current_weight) {
                        personalizedReason = `Perfecto para tu meta de pérdida de peso. ${food.benefit_reason}`;
                    } else if (user.goal_weight > user.current_weight) {
                        personalizedReason = `Ideal para tu meta de ganar masa muscular. ${food.benefit_reason}`;
                    }
                }
            }
        }

        return {
            food: food,
            reason: personalizedReason
        };
    } catch (error) {
        console.error('Error al obtener alimento del día:', error);
        // Fallback en caso de error
        return {
            food: {
                food_id: 456,
                name: "Acelga",
                description: "1 taza (175g) de acelga cocida, sin sal.",
                kcal: 35,
                protein: 3.3,
                carbs: 7,
                fats: 0.1,
                image_url: "https://imagenes2.eltiempo.com/files/image_1200_535/uploads/2023/05/09/645a9c00e1f42.jpeg",
                category: "Verdura"
            },
            reason: "Excelente para la salud digestiva y rica en antioxidantes."
        };
    }
};

// 4. Endpoints (Las "Rutas" de la API)

// --- RUTAS DE AUTENTICACIÓN (PÚBLICAS) ---
app.post('/api/register', async (req, res) => {
    const { email, password, nickname, first_name, last_name, phone, gender } = req.body;

    // 1. Validar campos obligatorios
    if (!email || !password || !nickname || !first_name || !last_name) {
        return res.status(400).json({ error: 'Campos obligatorios faltantes (email, password, nickname, first_name, last_name).' });
    }

    // 2. Validar contraseña
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
        return res.status(400).json({ error: passwordErrors.join(' ') });
    }
    
    try {
        // 3. Hashear contraseña
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 4. Guardar en BD
        const newUser = await db.query(
            "INSERT INTO users (email, password_hash, nickname, first_name, last_name, phone, gender) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id, email, nickname, first_name",
            [email, password_hash, nickname, first_name, last_name, phone, gender]
        );
        
        res.status(201).json(newUser.rows[0]);

    } catch (err) {
        if (err.code === '23505') {
            if (err.constraint === 'users_email_key') {
                return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
            }
            if (err.constraint === 'users_nickname_key') {
                return res.status(409).json({ error: 'El nickname ya está en uso.' });
            }
        }
        console.error(err);
        res.status(500).send({ error: 'Error interno al registrar usuario.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
        return res.status(400).json({ error: 'Se requiere correo/nickname y contraseña.' });
    }

    try {
        // Buscar por email O nickname
        const userResult = await db.query(
            "SELECT * FROM users WHERE email = $1 OR nickname = $1",
            [loginIdentifier]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const user = userResult.rows[0];

        // Comparar contraseña
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Crear Token
        const token = jwt.sign(
            { user_id: user.user_id, email: user.email, nickname: user.nickname },
            process.env.JWT_SECRET,
            { expiresIn: '24h' } 
        );

        res.json({ token, message: `Bienvenido de vuelta, ${user.first_name}` });

    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Error interno al iniciar sesión.' });
    }
});

// --- RUTAS DE USUARIO (PRIVADAS) ---
app.get('/api/user/profile', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    try {
        const result = await db.query(
            "SELECT user_id, email, nickname, first_name, last_name, phone, gender, profile_image_url, weight as current_weight, goal_weight, height, activity_level, daily_calorie_goal FROM users WHERE user_id = $1",
            [user_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/user/profile', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    const { first_name, last_name, email, nickname, phone, gender, profile_image_url, current_weight, goal_weight, height, activity_level, daily_calorie_goal } = req.body;

    try {
        const result = await db.query(
            `UPDATE users 
             SET first_name = COALESCE($1, first_name),
                 last_name = COALESCE($2, last_name),
                 email = COALESCE($3, email),
                 nickname = COALESCE($4, nickname),
                 phone = COALESCE($5, phone),
                 gender = COALESCE($6, gender),
                 profile_image_url = COALESCE($7, profile_image_url),
                 weight = COALESCE($8, weight),
                 goal_weight = COALESCE($9, goal_weight),
                 height = COALESCE($10, height),
                 activity_level = COALESCE($11, activity_level),
                 daily_calorie_goal = COALESCE($12, daily_calorie_goal)
             WHERE user_id = $13
             RETURNING user_id, email, nickname, first_name, last_name, phone, gender, profile_image_url, weight as current_weight, goal_weight, height, activity_level, daily_calorie_goal`,
            [first_name, last_name, email, nickname, phone, gender, profile_image_url, current_weight, goal_weight, height, activity_level, daily_calorie_goal, user_id]
        );
        
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
        }
        console.error('Error al actualizar perfil:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- NUEVA RUTA: Alimento del día ---
app.get('/api/food-of-the-day', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    try {
        const foodOfTheDay = await getFoodOfTheDay(user_id);
        if (!foodOfTheDay) {
            return res.status(404).json({ error: 'No se pudo obtener el alimento del día' });
        }
        res.json(foodOfTheDay);
    } catch (err) {
        console.error('Error al obtener alimento del día:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- RUTAS DE PESO ---
app.post('/api/weight/history', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    const { weight } = req.body;

    if (!weight) {
        return res.status(400).json({ error: 'El peso es requerido' });
    }

    try {
        const newRecord = await db.query(
            "INSERT INTO weight_history (user_id, weight, recorded_at) VALUES ($1, $2, CURRENT_DATE) RETURNING *",
            [user_id, weight]
        );
        res.status(201).json(newRecord.rows[0]);
    } catch (err) {
        console.error('Error al guardar peso:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/weight/history', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    try {
        const history = await db.query(
            "SELECT * FROM weight_history WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 30",
            [user_id]
        );
        res.json(history.rows);
    } catch (err) {
        console.error('Error al obtener historial de peso:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- RUTAS DE ALIMENTOS (PÚBLICAS) ---
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Se requiere un término de búsqueda.' });
    }

    try {
        const results = await db.query(
            "SELECT * FROM foods WHERE name ILIKE $1 OR category ILIKE $1 LIMIT 20",
            [`%${query}%`]
        );
        res.json(results.rows);
    } catch (err) {
        console.error('Error en búsqueda:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/foods/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query("SELECT * FROM foods WHERE food_id = $1", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alimento no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener alimento:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// RUTA DE SUGERENCIAS
app.get('/api/suggestions/seasonal', async (req, res) => {
    try {
        const suggestions = [
            'Mote con Huesillo',
            'Cazuela de Vacuno',
            'Sopaipillas (Fritas)'
        ];

        const result = await db.query(
            "SELECT * FROM foods WHERE name = ANY($1::text[])",
            [suggestions]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener sugerencias:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- RUTAS DE PLANES (PÚBLICAS Y PRIVADAS) ---
app.get('/api/viability', async (req, res) => {
    const { goal, q } = req.query;
    if (!goal || !q) {
        return res.status(400).json({ error: 'Faltan parámetros "goal" y "q".' });
    }

    let goalColumn;
    switch (goal) {
        case 'weightLoss':
            goalColumn = 'viability_weight_loss';
            break;
        case 'muscleGain':
            goalColumn = 'viability_muscle_gain';
            break;
        case 'maintenance':
            goalColumn = 'viability_maintenance';
            break;
        default:
            return res.status(400).json({ error: 'Objetivo no válido.' });
    }

    try {
        const queryText = `
            SELECT food_id, name, ${goalColumn} as "viability"
            FROM foods
            WHERE name ILIKE $1
            AND ${goalColumn} IS NOT NULL;
        `;
        const results = await db.query(queryText, [`%${q}%`]);
        res.json(results.rows);
    } catch (err) {
        console.error('Error en viabilidad:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/plans/premade/:type', async (req, res) => {
    const { type } = req.params;
    let plan_id;

    switch (type) {
        case 'weightLoss': plan_id = 4; break;
        case 'muscleGain': plan_id = 5; break;
        case 'maintenance': plan_id = 6; break;
        default: return res.status(400).json({ error: 'Tipo de plan no válido.' });
    }

    try {
        const planResult = await db.query("SELECT * FROM premade_plans WHERE plan_id = $1", [plan_id]);
        const itemsResult = await db.query("SELECT * FROM premade_plan_items WHERE plan_id = $1 ORDER BY meal_type", [plan_id]);

        if (planResult.rows.length === 0) {
            return res.status(404).json({ error: 'Plan no encontrado.' });
        }

        const plan = planResult.rows[0];
        plan.items = itemsResult.rows;
        
        res.json(plan);
    } catch (err) {
        console.error('Error al obtener plan pre-hecho:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// PLAN PERSONALIZADO ACTUALIZADO
app.get('/api/plans/custom', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    try {
        const items = await db.query(
            `SELECT cpi.*, f.name as food_name, f.kcal as base_kcal, f.protein as base_protein, 
                    f.carbs as base_carbs, f.fats as base_fats
             FROM custom_plan_items cpi
             LEFT JOIN foods f ON cpi.food_id = f.food_id
             WHERE cpi.user_id = $1 
             ORDER BY cpi.meal_type, cpi.created_at`,
            [user_id]
        );
        
        // Calcular valores nutricionales basados en cantidad
        const itemsWithNutrition = items.rows.map(item => {
            if (item.food_id && item.base_kcal) {
                const factor = item.quantity / 100;
                return {
                    ...item,
                    calories: Math.round((item.base_kcal || 0) * factor),
                    protein: Math.round(((item.base_protein || 0) * factor) * 10) / 10,
                    carbs: Math.round(((item.base_carbs || 0) * factor) * 10) / 10,
                    fats: Math.round(((item.base_fats || 0) * factor) * 10) / 10
                };
            }
            return item;
        });
        
        res.json(itemsWithNutrition);
    } catch (err) {
        console.error('Error al obtener plan custom:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/plans/custom', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    const { meal_type, food_id, quantity, custom_food_name } = req.body;

    if (!meal_type) {
        return res.status(400).json({ error: 'Faltan datos (meal_type)' });
    }

    try {
        let foodData = null;
        if (food_id) {
            // Obtener información nutricional del alimento
            const foodResult = await db.query("SELECT * FROM foods WHERE food_id = $1", [food_id]);
            if (foodResult.rows.length > 0) {
                foodData = foodResult.rows[0];
            }
        }

        const newItem = await db.query(
            `INSERT INTO custom_plan_items (user_id, meal_type, food_id, quantity, custom_food_name) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [
                user_id, 
                meal_type, 
                food_id, 
                quantity || 100, 
                custom_food_name
            ]
        );
        res.status(201).json(newItem.rows[0]);
    } catch (err) {
        console.error('Error al añadir item custom:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/plans/custom/:item_id', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    const { item_id } = req.params;

    try {
        await db.query(
            "DELETE FROM custom_plan_items WHERE item_id = $1 AND user_id = $2",
            [item_id, user_id]
        );
        res.json({ message: 'Item eliminado correctamente' });
    } catch (err) {
        console.error('Error al eliminar item:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- RUTAS DE COMUNIDAD (PRIVADAS) ---
app.get('/api/community/posts', checkAuth, async (req, res) => {
    let queryText = `
        SELECT p.post_id, p.title, p.content, p.category, p.created_at, p.user_id,
               u.nickname, u.profile_image_url,
               (SELECT json_agg(json_build_object(
                    'comment_id', c.comment_id,
                    'text', c.text,
                    'nickname', cu.nickname,
                    'profile_image_url', cu.profile_image_url,
                    'created_at', c.created_at
                ))
                FROM comments c
                JOIN users cu ON c.user_id = cu.user_id
                WHERE c.post_id = p.post_id
               ) as comments
        FROM posts p
        JOIN users u ON p.user_id = u.user_id
    `;
    
    if (req.query.category) {
        queryText += ` WHERE p.category = $1`;
    }
    
    queryText += ` ORDER BY p.created_at DESC`;

    try {
        const params = req.query.category ? [req.query.category] : [];
        const results = await db.query(queryText, params);
        res.json(results.rows);
    } catch (err) {
        console.error('Error al obtener posts:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/community/posts', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    const { category, title, content } = req.body;

    if (!category || !title || !content) {
        return res.status(400).json({ error: 'Faltan datos (category, title, content)' });
    }
    
    try {
        const newPost = await db.query(
            "INSERT INTO posts (user_id, category, title, content) VALUES ($1, $2, $3, $4) RETURNING *",
            [user_id, category, title, content]
        );
        res.status(201).json(newPost.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Error al crear post.' });
    }
});

app.post('/api/community/posts/:postId/comments', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    const { postId } = req.params;
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'El texto del comentario es requerido' });
    }

    try {
        const newComment = await db.query(
            "INSERT INTO comments (post_id, user_id, text) VALUES ($1, $2, $3) RETURNING *",
            [postId, user_id, text]
        );
        res.status(201).json(newComment.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Error al añadir comentario.' });
    }
});

app.delete('/api/community/posts/:postId', checkAuth, async (req, res) => {
    const user_id = req.user.user_id;
    const { postId } = req.params;

    try {
        const result = await db.query(
            "DELETE FROM posts WHERE post_id = $1 AND user_id = $2",
            [postId, user_id]
        );

        if (result.rowCount === 0) {
            return res.status(403).json({ error: 'No autorizado para eliminar este post o el post no existe.' });
        }

        res.status(200).json({ message: 'Post eliminado correctamente' });

    } catch (err) {
        console.error('Error al eliminar post:', err);
        res.status(500).send({ error: 'Error interno al eliminar el post.' });
    }
});

// 5. Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});