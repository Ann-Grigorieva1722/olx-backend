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
        const { title, description, category_id, price, location, type } = req.body;
        if (!title || !description || !category_id || !price || !location || !type) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }
        const [result] = await pool.query(
            'INSERT INTO ads (user_id, title, description, category_id, price, location, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, title, description, category_id, price, location, type]
        );
        const adId = result.insertId;
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await pool.query(
                    'INSERT INTO ad_photos (ad_id, photo_url) VALUES (?, ?)',
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
        const { keyword, category, price_min, price_max, location, sort_by, order } = req.query;
        let sql = 'SELECT ads.*, GROUP_CONCAT(ad_photos.photo_url) as photos FROM ads LEFT JOIN ad_photos ON ads.id = ad_photos.ad_id';
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
        if (location) {
            conditions.push('ads.location LIKE ?');
            params.push(`%${location}%`);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' GROUP BY ads.id ';
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
        const { title, description, category_id, price, location, type } = req.body;
        const [ads] = await pool.query(
            'SELECT * FROM ads WHERE id = ? AND user_id = ?',
            [adId, req.user.id]
        );
        if (ads.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к данному объявлению или объявление не найдено' });
        }
        await pool.query(
            'UPDATE ads SET title = ?, description = ?, category_id = ?, price = ?, location = ?, type = ? WHERE id = ?',
            [title, description, category_id, price, location, type, adId]
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
            'SELECT * FROM ads WHERE id = ? AND user_id = ?',
            [adId, req.user.id]
        );
        if (ads.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к данному объявлению или объявление не найдено' });
        }
        await pool.query('DELETE FROM ad_photos WHERE ad_id = ?', [adId]);
        await pool.query('DELETE FROM ads WHERE id = ?', [adId]);
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
            'SELECT * FROM ads WHERE id = ? AND user_id = ?',
            [adId, req.user.id]
        );
        if (ads.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к данному объявлению или объявление не найдено' });
        }
        await pool.query('UPDATE ads SET is_sold = 1 WHERE id = ?', [adId]);
        res.json({ message: 'Объявление отмечено как проданное' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
