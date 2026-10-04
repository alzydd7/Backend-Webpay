// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../database');

// ============================================
// MIDDLEWARE: Verify Turnstile
// ============================================
async function verifyTurnstile(req, res, next) {
    // Skip kalau turnstile disabled
    if (!config.turnstile.enabled) return next();

    const token = req.body.turnstileToken;
    if (!token) {
        return res.status(400).json({ success: false, message: 'Verifikasi anti-bot diperlukan' });
    }

    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: config.turnstile.secretKey,
                response: token,
                remoteip: req.ip
            })
        });
        const data = await response.json();
        if (!data.success) {
            return res.status(400).json({ success: false, message: 'Verifikasi anti-bot gagal' });
        }
        next();
    } catch (err) {
        console.error('Turnstile error:', err);
        res.status(500).json({ success: false, message: 'Verifikasi anti-bot error' });
    }
}

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register', verifyTurnstile, (req, res) => {
    const { username, password, displayName } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username & password wajib' });
    }
    if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ success: false, message: 'Username 3-20 karakter' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ success: false, message: 'Username hanya huruf, angka, underscore' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        return res.status(400).json({ success: false, message: 'Username sudah dipakai' });
    }

    try {
        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare(`
            INSERT INTO users (username, password, display_name, role, balance)
            VALUES (?, ?, ?, 'user', 0)
        `).run(username, hash, displayName || username);

        res.json({ success: true, message: 'Registrasi berhasil', userId: result.lastInsertRowid });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal registrasi' });
    }
});

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login', verifyTurnstile, (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username & password wajib' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    // Log attempt
    db.prepare('INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)')
      .run(username, ip, user && bcrypt.compareSync(password, user.password) ? 1 : 0);

    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    if (user.is_banned) {
        return res.status(403).json({ success: false, message: 'Akun diblokir' });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwtSecret,
        { expiresIn: '7d' }
    );

    res.json({
        success: true,
        token,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role,
            balance: user.balance,
            avatar: user.avatar,
            bio: user.bio,
            theme: user.theme
        }
    });
});

// ============================================
// MIDDLEWARE: Auth Required
// ============================================
function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token tidak ada' });
    }
    try {
        const token = header.split(' ')[1];
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        if (!user || user.is_banned) {
            return res.status(401).json({ success: false, message: 'Akun tidak valid' });
        }
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: 'Token expired/invalid' });
    }
}

// ============================================
// MIDDLEWARE: Admin Only
// ============================================
function adminRequired(req, res, next) {
    authRequired(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses admin diperlukan' });
        }
        next();
    });
}

// ============================================
// GET /api/auth/me
// ============================================
router.get('/me', authRequired, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            username: req.user.username,
            displayName: req.user.display_name,
            role: req.user.role,
            balance: req.user.balance,
            avatar: req.user.avatar,
            bio: req.user.bio,
            theme: req.user.theme
        }
    });
});

// ============================================
// PUT /api/auth/profile
// ============================================
router.put('/profile', authRequired, (req, res) => {
    const { displayName, bio, avatar, theme } = req.body;
    db.prepare(`
        UPDATE users SET 
            display_name = COALESCE(?, display_name),
            bio = COALESCE(?, bio),
            avatar = COALESCE(?, avatar),
            theme = COALESCE(?, theme)
        WHERE id = ?
    `).run(displayName, bio, avatar, theme, req.user.id);
    res.json({ success: true, message: 'Profil diperbarui' });
});

module.exports = router;
module.exports.authRequired = authRequired;
module.exports.adminRequired = adminRequired;
module.exports.verifyTurnstile = verifyTurnstile;