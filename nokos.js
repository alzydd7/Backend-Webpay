// routes/nokos.js
const express = require('express');
const router = express.Router();
const config = require('../config');
const { db } = require('../database');
const { authRequired } = require('./auth');

// ============================================
// STEP 1: GET /api/nokos/servers
// Ambil daftar server
// ============================================
router.get('/servers', authRequired, async (req, res) => {
    if (!config.nokos.enabled || !config.nokos.apiKey) {
        return res.status(503).json({ 
            success: false, 
            message: 'API key nokos belum terhubung' 
        });
    }

    try {
        // ============ CONTOH INTEGRASI PROVIDER ============
        // Sesuaikan dengan provider kamu (SMS-Activate, 5sim, dll)
        // const response = await fetch(`${config.nokos.baseUrl}?action=getServers&api_key=${config.nokos.apiKey}`);
        // const data = await response.json();
        
        // Sementara: ambil dari catalog DB
        const servers = db.prepare('SELECT DISTINCT server FROM nokos_catalog WHERE is_active = 1').all();
        res.json({ success: true, servers: servers.map(s => s.server) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Gagal ambil server' });
    }
});

// ============================================
// STEP 2: GET /api/nokos/services?server=xxx
// ============================================
router.get('/services', authRequired, (req, res) => {
    if (!config.nokos.enabled || !config.nokos.apiKey) {
        return res.status(503).json({ success: false, message: 'API key nokos belum terhubung' });
    }
    const { server } = req.query;
    if (!server) return res.status(400).json({ success: false, message: 'Server wajib' });

    const services = db.prepare(`
        SELECT DISTINCT service FROM nokos_catalog 
        WHERE server = ? AND is_active = 1
    `).all(server);

    res.json({ success: true, services: services.map(s => s.service) });
});

// ============================================
// STEP 3: GET /api/nokos/countries?server=xxx&service=yyy
// ============================================
router.get('/countries', authRequired, (req, res) => {
    if (!config.nokos.enabled || !config.nokos.apiKey) {
        return res.status(503).json({ success: false, message: 'API key nokos belum terhubung' });
    }
    const { server, service } = req.query;
    const countries = db.prepare(`
        SELECT DISTINCT country FROM nokos_catalog 
        WHERE server = ? AND service = ? AND is_active = 1
    `).all(server, service);

    res.json({ success: true, countries: countries.map(c => c.country) });
});

// ============================================
// STEP 4: GET /api/nokos/operators?...
// ============================================
router.get('/operators', authRequired, (req, res) => {
    if (!config.nokos.enabled || !config.nokos.apiKey) {
        return res.status(503).json({ success: false, message: 'API key nokos belum terhubung' });
    }
    const { server, service, country } = req.query;
    const operators = db.prepare(`
        SELECT id, operator, modal, price, stock FROM nokos_catalog 
        WHERE server = ? AND service = ? AND country = ? AND is_active = 1 AND stock > 0
    `).all(server, service, country);

    res.json({ success: true, operators });
});

// ============================================
// STEP 5: POST /api/nokos/order
// ============================================
router.post('/order', authRequired, async (req, res) => {
    if (!config.nokos.enabled || !config.nokos.apiKey) {
        return res.status(503).json({ success: false, message: 'API key nokos belum terhubung' });
    }

    const { catalogId } = req.body;
    const item = db.prepare('SELECT * FROM nokos_catalog WHERE id = ? AND is_active = 1').get(catalogId);
    if (!item) return res.status(404).json({ success: false, message: 'Item tidak ditemukan' });
    if (item.stock < 1) return res.status(400).json({ success: false, message: 'Stok habis' });

    // Cek saldo user
    if (req.user.balance < item.price) {
        return res.status(400).json({ success: false, message: 'Saldo tidak cukup' });
    }

    const orderId = '#ZPR-' + Date.now() + '-' + req.user.id;
    const profit = item.price - item.modal;

    const tx = db.transaction(() => {
        // Kurangi saldo
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(item.price, req.user.id);
        // Buat order
        db.prepare(`
            INSERT INTO orders (order_id, user_id, type, service_name, service_detail, modal, price, profit, status)
            VALUES (?, ?, 'nokos', ?, ?, ?, ?, ?, 'pending')
        `).run(
            orderId, req.user.id,
            `Nokos ${item.service} - ${item.country}`,
            JSON.stringify(item),
            item.modal, item.price, profit
        );
        // Kurangi stok
        db.prepare('UPDATE nokos_catalog SET stock = stock - 1 WHERE id = ?').run(item.id);
    });
    tx();

    // ============ DISINI PANGGIL API PROVIDER BENERAN ============
    // const apiResp = await fetch(`${config.nokos.baseUrl}?action=getNumber&service=...&api_key=${config.nokos.apiKey}`);
    // Simpan response (nomor HP, order ID provider) ke tabel orders service_detail

    res.json({
        success: true,
        message: 'Order nokos berhasil',
        orderId,
        // nomor: apiResp.phone, // dari provider
    });
});

module.exports = router;