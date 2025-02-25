const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { authenticateToken } = require('../middlewares/auth');
const router = express.Router();

router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT user_id as id, username, email FROM users WHERE user_id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json(users[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { username, email, password, newPassword } = req.body;
        if (username || email) {
            await pool.query(
                'UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email) WHERE user_id = ?',
                [username, email, req.user.id]
            );
        }
        if (password && newPassword) {
            const [users] = await pool.query(
                'SELECT password_hash FROM users WHERE user_id = ?',
                [req.user.id]
            );
            if (users.length === 0) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            const valid = await bcrypt.compare(password, users[0].password_hash);
            if (!valid) {
                return res.status(400).json({ error: 'Текущий пароль указан неверно' });
            }
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            await pool.query(
                'UPDATE users SET password_hash = ? WHERE user_id = ?',
                [hashedNewPassword, req.user.id]
            );
        }
        res.json({ message: 'Профиль успешно обновлён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
