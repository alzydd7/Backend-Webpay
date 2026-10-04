// routes/broadcast.js
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authRequired, adminRequired } = require('./auth');

// Admin: kirim broadcast
router.post('/', adminRequired, (req, res) => {
    const { title, message, type } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'Judul & pesan wajib' });

    const result = db.prepare(`
        INSERT INTO broadcasts (title, message, type, created_by)
        VALUES (?, ?, ?, ?)
    `).run(title, message, type || 'info', req.user.id);

    res.json({ success: true, message: 'Broadcast terkirim', id: result.lastInsertRowid });
});

// User: ambil broadcast yang belum dibaca
router.get('/unread', authRequired, (req, res) => {
    const list = db.prepare(`
        SELECT b.* FROM broadcasts b
        WHERE b.id NOT IN (
            SELECT broadcast_id FROM broadcast_reads WHERE user_id = ?
        )
        ORDER BY b.id DESC
    `).all(req.user.id);
    res.json({ success: true, broadcasts: list });
});

// User: tandai sudah dibaca
router.post('/:id/read', authRequired, (req, res) => {
    const id = parseInt(req.params.id);
    db.prepare(`
        INSERT OR IGNORE INTO broadcast_reads (broadcast_id, user_id) VALUES (?, ?)
    `).run(id, req.user.id);
    res.json({ success: true });
});

// Admin: list semua broadcast
router.get('/all', adminRequired, (req, res) => {
    const list = db.prepare('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 100').all();
    res.json({ success: true, broadcasts: list });
});

// Admin: hapus broadcast
router.delete('/:id', adminRequired, (req, res) => {
    db.prepare('DELETE FROM broadcasts WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true, message: 'Broadcast dihapus' });
});

module.exports = router;