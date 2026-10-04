// routes/script.js
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authRequired, adminRequired } = require('./auth');

// Public: list script
router.get('/list', authRequired, (req, res) => {
    const scripts = db.prepare('SELECT * FROM scripts WHERE is_active = 1 ORDER BY id DESC').all();
    res.json({ success: true, scripts });
});

// Admin: create script
router.post('/', adminRequired, (req, res) => {
    const { name, description, price, image, stock } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: 'Nama & harga wajib' });

    const result = db.prepare(`
        INSERT INTO scripts (name, description, price, image, stock, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
    `).run(name, description || '', parseInt(price), image || '', parseInt(stock) || 1);

    res.json({ success: true, message: 'Script ditambahkan', id: result.lastInsertRowid });
});

// Admin: update script
router.put('/:id', adminRequired, (req, res) => {
    const id = parseInt(req.params.id);
    const { name, description, price, image, stock, is_active } = req.body;

    db.prepare(`
        UPDATE scripts SET
            name = COALESCE(?, name),
            description = COALESCE(?, description),
            price = COALESCE(?, price),
            image = COALESCE(?, image),
            stock = COALESCE(?, stock),
            is_active = COALESCE(?, is_active)
        WHERE id = ?
    `).run(name, description, price, image, stock, is_active, id);

    res.json({ success: true, message: 'Script diperbarui' });
});

// Admin: delete script
router.delete('/:id', adminRequired, (req, res) => {
    db.prepare('DELETE FROM scripts WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true, message: 'Script dihapus' });
});

// User: beli script
router.post('/buy/:id', authRequired, (req, res) => {
    const script = db.prepare('SELECT * FROM scripts WHERE id = ? AND is_active = 1').get(parseInt(req.params.id));
    if (!script) return res.status(404).json({ success: false, message: 'Script tidak ditemukan' });
    if (script.stock < 1) return res.status(400).json({ success: false, message: 'Stok habis' });
    if (req.user.balance < script.price) {
        return res.status(400).json({ success: false, message: 'Saldo tidak cukup' });
    }

    const orderId = '#ZPR-' + Date.now() + '-' + req.user.id;

    const tx = db.transaction(() => {
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(script.price, req.user.id);
        db.prepare(`
            INSERT INTO orders (order_id, user_id, type, service_name, modal, price, profit, status)
            VALUES (?, ?, 'script', ?, ?, ?, ?, 'success')
        `).run(orderId, req.user.id, script.name, 0, script.price, script.price);
        db.prepare('UPDATE scripts SET stock = stock - 1 WHERE id = ?').run(script.id);
    });
    tx();

    res.json({ success: true, message: 'Pembelian berhasil', orderId });
});

module.exports = router;