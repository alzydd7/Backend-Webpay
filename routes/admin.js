// routes/admin.js
const express = require('express');
const router = express.Router();
const { db, getSetting, setSetting } = require('../database');
const { adminRequired } = require('./auth');

// ============================================
// GET /api/admin/stats
// ============================================
router.get('/stats', adminRequired, (req, res) => {
    const stats = {
        totalUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE role = "user"').get().c,
        totalOrders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
        pendingDeposits: db.prepare('SELECT COUNT(*) as c FROM deposits WHERE status = "pending"').get().c,
        totalBalance: db.prepare('SELECT COALESCE(SUM(balance), 0) as s FROM users').get().s,
        totalProfit: db.prepare('SELECT COALESCE(SUM(profit), 0) as s FROM orders WHERE status = "success"').get().s,
    };
    res.json({ success: true, stats });
});

// ============================================
// GET /api/admin/users
// ============================================
router.get('/users', adminRequired, (req, res) => {
    const users = db.prepare(`
        SELECT id, username, display_name, role, balance, is_banned, created_at
        FROM users ORDER BY id DESC LIMIT 200
    `).all();
    res.json({ success: true, users });
});

// ============================================
// POST /api/admin/users/:id/ban
// ============================================
router.post('/users/:id/ban', adminRequired, (req, res) => {
    db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true, message: 'User dibanned' });
});

// ============================================
// POST /api/admin/users/:id/unban
// ============================================
router.post('/users/:id/unban', adminRequired, (req, res) => {
    db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true, message: 'User di-unban' });
});

// ============================================
// POST /api/admin/users/:id/balance
// Adjust saldo manual
// ============================================
router.post('/users/:id/balance', adminRequired, (req, res) => {
    const { amount } = req.body; // bisa + atau -
    const id = parseInt(req.params.id);
    db.prepare('UPDATE users SET balance = MAX(0, balance + ?) WHERE id = ?').run(parseInt(amount), id);
    res.json({ success: true, message: 'Saldo disesuaikan' });
});

// ============================================
// GET /api/admin/orders
// ============================================
router.get('/orders', adminRequired, (req, res) => {
    const orders = db.prepare(`
        SELECT o.*, u.username FROM orders o
        JOIN users u ON u.id = o.user_id
        ORDER BY o.id DESC LIMIT 200
    `).all();
    res.json({ success: true, orders });
});

// ============================================
// GET /api/admin/orders/pending
// ============================================
router.get('/orders/pending', adminRequired, (req, res) => {
    const orders = db.prepare(`
        SELECT o.*, u.username FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.status = 'pending'
        ORDER BY o.id ASC
    `).all();
    res.json({ success: true, orders });
});

// ============================================
// POST /api/admin/orders/:id/complete
// Mark order success
// ============================================
router.post('/orders/:id/complete', adminRequired, (req, res) => {
    db.prepare('UPDATE orders SET status = "success" WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true });
});

// ============================================
// POST /api/admin/orders/:id/fail
// ============================================
router.post('/orders/:id/fail', adminRequired, (req, res) => {
    db.prepare('UPDATE orders SET status = "failed" WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true });
});

// ============================================
// NOKOS CATALOG (admin CRUD)
// ============================================
router.post('/nokos/catalog', adminRequired, (req, res) => {
    const { server, service, country, operator, modal, price, stock } = req.body;
    const result = db.prepare(`
        INSERT INTO nokos_catalog (server, service, country, operator, modal, price, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(server, service, country, operator, parseInt(modal), parseInt(price), parseInt(stock));
    res.json({ success: true, id: result.lastInsertRowid });
});

router.get('/nokos/catalog', adminRequired, (req, res) => {
    const list = db.prepare('SELECT * FROM nokos_catalog ORDER BY id DESC').all();
    res.json({ success: true, items: list });
});

router.delete('/nokos/catalog/:id', adminRequired, (req, res) => {
    db.prepare('DELETE FROM nokos_catalog WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true });
});

// ============================================
// SUNTIK CATALOG
// ============================================
router.post('/suntik/catalog', adminRequired, (req, res) => {
    const { category, name, min_qty, max_qty, modal_per_1k, price_per_1k } = req.body;
    const result = db.prepare(`
        INSERT INTO suntik_catalog (category, name, min_qty, max_qty, modal_per_1k, price_per_1k)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(category, name, parseInt(min_qty), parseInt(max_qty), parseInt(modal_per_1k), parseInt(price_per_1k));
    res.json({ success: true, id: result.lastInsertRowid });
});

router.get('/suntik/catalog', adminRequired, (req, res) => {
    const list = db.prepare('SELECT * FROM suntik_catalog ORDER BY id DESC').all();
    res.json({ success: true, items: list });
});

router.delete('/suntik/catalog/:id', adminRequired, (req, res) => {
    db.prepare('DELETE FROM suntik_catalog WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true });
});

// ============================================
// SETTINGS (bisa override dari config.js)
// ============================================
router.get('/settings/:key', adminRequired, (req, res) => {
    res.json({ success: true, value: getSetting(req.params.key) });
});

router.post('/settings', adminRequired, (req, res) => {
    const { key, value } = req.body;
    setSetting(key, value);
    res.json({ success: true, message: 'Setting disimpan' });
});

module.exports = router;