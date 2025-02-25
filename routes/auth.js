const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const router = express.Router();
const crypto = require('crypto');

const JWT_SECRET = crypto.randomBytes(64).toString('hex');

router.post('/register', async (req, res) => {
    try {
        const { username, email, password, first_name, last_name, phone } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Укажите имя пользователя, email и пароль' });
        }
        const [existing] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [email, username]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email или именем уже существует' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, email, password_hash, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, first_name || null, last_name || null, phone || null]
        );
        res.json({ message: 'Пользователь успешно зарегистрирован' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password) {
            return res.status(400).json({ error: 'Укажите логин и пароль' });
        }
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [login, login]
        );
        if (users.length === 0) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        const user = users[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        const token = jwt.sign(
            { id: user.user_id, username: user.username, email: user.email },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        if (!email || !newPassword) {
            return res.status(400).json({ error: 'Укажите email и новый пароль' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const [result] = await pool.query(
            'UPDATE users SET password_hash = ? WHERE email = ?',
            [hashedPassword, email]
        );
        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Пользователь с таким email не найден' });
        }
        res.json({ message: 'Пароль успешно изменён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
