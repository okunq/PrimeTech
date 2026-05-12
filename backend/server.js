const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); 
const app = express();
const multer = require('multer');
const path = require('path');
const PORT = 3000;

app.use(cors());
app.use(express.json());

//шлях до папки frontend
const publicPath = path.join(__dirname, '../frontend');

console.log("========================================");
console.log("📂 Сервер шукає файли у цій папці:");
console.log(publicPath);
console.log("========================================");

//роздаємо всі статичні файли з папки frontend
app.use(express.static(publicPath));

//налаштування multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../frontend/img/')); 
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

//маршрут для прийому файлу
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Файл не завантажено" });
    }
    res.json({ imageUrl: 'img/' + req.file.filename });
});



const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_ouRHzGB8S2XK@ep-spring-darkness-alce3h0t.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require',
    ssl: {
        rejectUnauthorized: false
    }
});

//оновлений маршрут для замовлення та товарів
app.post('/api/orders', async (req, res) => {
    const client = await pool.connect(); 
    try {
        const { delivery_method, payment_method, delivery_address, total_price, items } = req.body;

        await client.query('BEGIN'); 

        const orderResult = await client.query(
            'INSERT INTO orders (delivery_method, payment_method, delivery_address, total_price) VALUES ($1, $2, $3, $4) RETURNING id',
            [delivery_method, payment_method, delivery_address, total_price]
        );
        const orderId = orderResult.rows[0].id;

        const itemQuery = 'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)';
        
        for (const item of items) {
            let qty = item.quantity || 1;
            await client.query(itemQuery, [orderId, item.id, 1, item.price]);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: "Замовлення успішно збережено!", orderId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Помилка при збереженні замовлення:", error);
        res.status(500).json({ error: "Помилка сервера" });
    } finally {
        client.release();
    }
});

//отримати всі товари
app.get('/api/products', async (req, res) => {
    try {
        const { category, search, minPrice, maxPrice, page = 1 } = req.query;
        const limit = 12;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT *, COUNT(*) OVER() AS total_count FROM products';
        let params = [];
        let conditions = [];

        if (category) { params.push(category); conditions.push(`category_id = $${params.length}`); }
        if (search) { params.push(`%${search}%`); conditions.push(`name ILIKE $${params.length}`); }
        if (minPrice) { params.push(minPrice); conditions.push(`price >= $${params.length}`); }
        if (maxPrice) { params.push(maxPrice); conditions.push(`price <= $${params.length}`); }

        if (conditions.length > 0) { query += ' WHERE ' + conditions.join(' AND '); }
        query += ` ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error("Помилка бази:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//отримати один товар за його ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Товар не знайдено" });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: "Помилка сервера" });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, category_id, price, image_url, status, description } = req.body;
        const productStatus = status || 'В наявності'; 

        const result = await pool.query(
            'INSERT INTO products (category_id, name, price, image_url, status, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [category_id, name, price, image_url, productStatus, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Помилка при додаванні товару:", error);
        res.status(500).json({ error: "Помилка сервера при збереженні" });
    }
});

//маршрут для видалення товару за ID
app.delete('/api/products/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
        res.json({ message: "Товар видалено" });
    } catch (error) {
        console.error("Помилка при видаленні:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { name, category_id, price, image_url, status, description } = req.body;

        const result = await pool.query(
            'UPDATE products SET name = $1, category_id = $2, price = $3, image_url = $4, status = $5, description = $6 WHERE id = $7 RETURNING *',
            [name, category_id, price, image_url, status, description, id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Помилка при оновленні товару:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//авторизація та реєстрація користувачів

//реєстрація нового користувача
app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, email, password } = req.body;

        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: "Користувач з таким email вже існує!" });
        }

        //шифрування паролю
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const newUser = await pool.query(
            'INSERT INTO users (name, phone, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
            [name, phone, email, passwordHash]
        );

        res.status(201).json({ message: "Реєстрація успішна!", user: newUser.rows[0] });
    } catch (error) {
        console.error("Помилка реєстрації:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//вхід користувача
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: "Користувача з таким email не знайдено" });
        }

        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: "Невірний пароль" });
        }

        res.json({ message: "Вхід виконано!", user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error("Помилка входа:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//Упраіння замовленнями та користувачами (для адміна)

//отримати всі замовлення з товарами
app.get('/api/orders', async (req, res) => {
    try {
        const query = `
            SELECT o.id, o.delivery_method, o.payment_method, o.delivery_address, o.total_price, o.status, o.created_at,
            string_agg(p.name, ', ') as items_list
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            GROUP BY o.id ORDER BY o.id DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error("Помилка при отриманні замовлень:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

app.get('/api/admin/export-orders', async (req, res) => {
    try {
        const query = `
            SELECT o.id, o.delivery_method, o.payment_method, o.delivery_address, o.total_price, o.status, o.created_at,
            string_agg(p.name, ', ') as items_list
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            GROUP BY o.id ORDER BY o.id DESC
        `;
        const result = await pool.query(query);
        let csvContent = '\uFEFF';
        csvContent += "ID;Товари;Адреса доставки;Спосіб оплати;Сума (UAH);Статус\n";

        result.rows.forEach(row => {
            const id = row.id;
            //екрануємо лапки та замінюємо переноси рядків, щоб таблиця не ламалася
            const items = `"${(row.items_list || '').replace(/"/g, '""')}"`;
            const address = `"${(row.delivery_address || '').replace(/"/g, '""')}"`;
            const payment = `"${(row.payment_method || '').replace(/"/g, '""')}"`;
            const total = row.total_price;
            const status = `"${(row.status || '').replace(/"/g, '""')}"`;

            csvContent += `${id};${items};${address};${payment};${total};${status}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="orders_report.csv"');
        res.send(csvContent);
    } catch (error) {
        console.error("Помилка експорту:", error);
        res.status(500).send("Помилка сервера");
    }
});

//оновити статус замовлення
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ message: "Статус оновлено" });
    } catch (error) {
        console.error("Помилка оновлення статусу:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

// Видалити замовлення
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        await pool.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
        await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
        
        res.json({ message: "Замовлення успішно видалено" });
    } catch (error) {
        console.error("Помилка при видаленні замовлення:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});



//отримати всіх користувачів для адміна
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, phone, email, created_at FROM users ORDER BY id DESC');
        res.json(result.rows);
    } catch (error) {
        console.error("Помилка при отриманні користувачів:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//видалити користувача
app.delete('/api/users/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: "Користувача видалено" });
    } catch (error) {
        console.error("Помилка при видаленні користувача:", error);
        res.status(500).json({ error: "Помилка сервера" });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const ordersCount = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'Новий'");
        const usersCount = await pool.query("SELECT COUNT(*) FROM users");
        
        res.json({
            newOrders: ordersCount.rows[0].count,
            totalUsers: usersCount.rows[0].count
        });
    } catch (error) {
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//додати відгук
app.post('/api/reviews', async (req, res) => {
    try {
        const { product_id, user_id, rating, comment } = req.body;
        const result = await pool.query(
            'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [product_id, user_id, rating, comment]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//отримати відгуки для конкретного товару
app.get('/api/reviews/:productId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT r.*, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.product_id = $1 ORDER BY r.created_at DESC',
            [req.params.productId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Помилка сервера" });
    }
});

//маршрут для неіснуючих API
app.use('/api', (req, res) => {
    res.status(404).json({ error: "API маршрут не знайдено" });
});

//помилка 404 для браузера
app.use((req, res) => {
    res.status(404).send(`
        <h2 style="color: red; text-align: center; margin-top: 50px;">Помилка 404: Файл не знайдено</h2>
        <p style="text-align: center;">Сервер працює, але не бачить твоїх сторінок.</p>
        <p style="text-align: center;">Він шукає їх у цій папці: <b>${publicPath}</b></p>
    `);
});

app.listen(PORT, () => {
    console.log(`Сервер PrimeTech успешно запущен на порту http://localhost:${PORT}`);
});