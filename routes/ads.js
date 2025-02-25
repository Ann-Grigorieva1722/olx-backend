const express = require('express');
const pool = require('../db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middlewares/auth');
const router = express.Router();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'ads');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    },
});
const upload = multer({ storage });

router.post('/', authenticateToken, upload.array('photos', 10), async (req, res) => {
    try {
        // Изменили поля: вместо location и type — ожидаем city (city_id) и ad_type (значение типа объявления)
        const { title, description, category_id, price, city, ad_type } = req.body;
        if (!title || !description || !category_id || !price || !city || !ad_type) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }

        // Получаем ad_type_id по типу объявления из таблицы ad_types
        const [adTypeRows] = await pool.query('SELECT ad_type_id FROM ad_types WHERE type_name = ?', [ad_type]);
        if (adTypeRows.length === 0) {
            return res.status(400).json({ error: 'Неверный тип объявления' });
        }
        const ad_type_id = adTypeRows[0].ad_type_id;
        // city ожидается как id города (city_id)

        const [result] = await pool.query(
            'INSERT INTO ads (user_id, category_id, ad_type_id, title, description, price, city_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, category_id, ad_type_id, title, description, price, city]
        );
        const adId = result.insertId;
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await pool.query(
                    'INSERT INTO photos (ad_id, photo_url) VALUES (?, ?)',
                    [adId, file.path]
                );
            }
        }
        res.json({ message: 'Объявление успешно создано', adId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/', async (req, res) => {
    try {
        const { keyword, category, price_min, price_max, city, sort_by, order } = req.query;
        let sql = 'SELECT ads.*, GROUP_CONCAT(photos.photo_url) as photos FROM ads LEFT JOIN photos ON ads.ad_id = photos.ad_id';
        let conditions = [];
        let params = [];

        if (keyword) {
            conditions.push('(ads.title LIKE ? OR ads.description LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (category) {
            conditions.push('ads.category_id = ?');
            params.push(category);
        }
        if (price_min) {
            conditions.push('ads.price >= ?');
            params.push(price_min);
        }
        if (price_max) {
            conditions.push('ads.price <= ?');
            params.push(price_max);
        }
        if (city) {
            conditions.push('ads.city_id = ?');
            params.push(city);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' GROUP BY ads.ad_id ';
        if (sort_by) {
            const sortOrder = order && order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            sql += ` ORDER BY ads.${sort_by} ${sortOrder} `;
        }
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const adId = req.params.id;
        const { title, description, category_id, price, city, ad_type } = req.body;
        const [ads] = await pool.query(
            'SELECT * FROM ads WHERE ad_id = ? AND user_id = ?',
            [adId, req.user.id]
        );
        if (ads.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к данному объявлению или объявление не найдено' });
        }
        const [adTypeRows] = await pool.query('SELECT ad_type_id FROM ad_types WHERE type_name = ?', [ad_type]);
        if (adTypeRows.length === 0) {
            return res.status(400).json({ error: 'Неверный тип объявления' });
        }
        const ad_type_id = adTypeRows[0].ad_type_id;
        await pool.query(
            'UPDATE ads SET title = ?, description = ?, category_id = ?, ad_type_id = ?, price = ?, city_id = ? WHERE ad_id = ?',
            [title, description, category_id, ad_type_id, price, city, adId]
        );
        res.json({ message: 'Объявление успешно обновлено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const adId = req.params.id;
        const [ads] = await pool.query(
            'SELECT * FROM ads WHERE ad_id = ? AND user_id = ?',
            [adId, req.user.id]
        );
        if (ads.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к данному объявлению или объявление не найдено' });
        }
        await pool.query('DELETE FROM photos WHERE ad_id = ?', [adId]);
        await pool.query('DELETE FROM ads WHERE ad_id = ?', [adId]);
        res.json({ message: 'Объявление успешно удалено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.patch('/:id/mark-sold', authenticateToken, async (req, res) => {
    try {
        const adId = req.params.id;
        const [ads] = await pool.query(
            'SELECT * FROM ads WHERE ad_id = ? AND user_id = ?',
            [adId, req.user.id]
        );
        if (ads.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к данному объявлению или объявление не найдено' });
        }
        // Если столбца is_sold нет, добавьте его в БД (например, ALTER TABLE ads ADD COLUMN is_sold TINYINT(1) DEFAULT 0)
        await pool.query('UPDATE ads SET is_sold = 1 WHERE ad_id = ?', [adId]);
        res.json({ message: 'Объявление отмечено как проданное' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;