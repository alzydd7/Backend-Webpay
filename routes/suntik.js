// routes/suntik.js
const express = require('express');
const router = express.Router();
const config = require('../config');
const { db } = require('../database');
const { authRequired } = require('./auth');

// GET /api/suntik/categories
router.get('/categories', authRequired, (req, res) => {
    if (!config.suntik.enabled || !config.suntik.apiKey) {
        return res.status(503).json({ success: false, message: 'API key suntik belum terhubung' });
    }
    const cats = db.prepare('SELECT DISTINCT category FROM suntik_catalog WHERE is_active = 1').all();
    res.json({ success: true, categories: cats.map(c => c.category) });
});

// GET /api/suntik/list?category=xxx
router.get('/list', authRequired, (req, res) => {
    if (!config.suntik.enabled || !config.suntik.apiKey) {
        return res.status(503).json({ success: false, message: 'API key suntik belum terhubung' });
    }
    const { category } = req.query;
    const items = category 
        ? db.prepare('SELECT * FROM suntik_catalog WHERE category = ? AND is_active = 1').all(category)
        : db.prepare('SELECT * FROM suntik_catalog WHERE is_active = 1').all();
    res.json({ success: true, items });
});

// POST /api/suntik/order
router.post('/order', authRequired, async (req, res) => {
    if (!config.suntik.enabled || !config.suntik.apiKey) {
        return res.status(503).json({ success: false, message: 'API key suntik belum terhubung' });
    }

    const { itemId, target, quantity } = req.body;
    const item = db.prepare('SELECT * FROM suntik_catalog WHERE id = ? AND is_active = 1').get(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    if (quantity < item.min_qty || quantity > item.max_qty) {
        return res.status(400).json({ success: false, message: `Jumlah ${item.min_qty} - ${item.max_qty}` });
    }

    const totalPrice = Math.ceil(quantity / 1000) * item.price_per_1k;
    const totalModal = Math.ceil(quantity / 1000) * item.modal_per_1k;
    const profit = totalPrice - totalModal;

    if (req.user.balance < totalPrice) {
        return res.status(400).json({ success: false, message: 'Saldo tidak cukup' });
    }

    const orderId = '#ZPR-' + Date.now() + '-' + req.user.id;

    const tx = db.transaction(() => {
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(totalPrice, req.user.id);
        db.prepare(`
            INSERT INTO orders (order_id, user_id, type, service_name, service_detail, modal, price, profit, status)
            VALUES (?, ?, 'suntik', ?, ?, ?, ?, ?, 'pending')
        `).run(
            orderId, req.user.id,
            item.name,
            JSON.stringify({ target, quantity, itemId }),
            totalModal, totalPrice, profit
        );
    });
    tx();

    // ============ PANGGIL API PROVIDER SUNTIK ============
    // const apiResp = await fetch(`${config.suntik.baseUrl}?api_key=${config.suntik.apiKey}&service=${item.id}&target=${target}&quantity=${quantity}`);

    res.json({ success: true, message: 'Order suntik berhasil', orderId });
});

module.exports = router;