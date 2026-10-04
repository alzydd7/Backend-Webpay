// routes/deposit.js — Vercel Edition
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { db } = require('../database');
const { authRequired, adminRequired } = require('./auth');

// ============================================
// SETUP UPLOAD
// ============================================
// Vercel function filesystem READ-ONLY, kecuali /tmp
// Jadi upload bukti transfer disimpan di /tmp
const uploadDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'uploads');
if (!process.env.VERCEL && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `proof_${Date.now()}_${req.user?.id || 'anon'}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // max 3MB
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) cb(null, true);
        else cb(new Error('Hanya gambar yang diizinkan'));
    }
});

// ============================================
// POST /api/deposit/request
// User ajukan deposit + upload bukti
// ============================================
router.post('/request', authRequired, upload.single('proof'), (req, res) => {
    try {
        const { amount, method } = req.body;
        const amt = parseInt(amount);

        // Validasi
        if (!amt || amt < config.deposit.minAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimal deposit Rp ${config.deposit.minAmount.toLocaleString('id-ID')}`
            });
        }
        if (amt > config.deposit.maxAmount) {
            return res.status(400).json({
                success: false,
                message: `Maksimal deposit Rp ${config.deposit.maxAmount.toLocaleString('id-ID')}`
            });
        }
        if (!method) {
            return res.status(400).json({ success: false, message: 'Metode wajib dipilih' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Bukti transfer wajib diupload' });
        }

        // Path bukti — kalau di Vercel pakai /tmp, kalau lokal pakai /uploads
        const proofPath = process.env.VERCEL 
            ? '/tmp/' + req.file.filename 
            : '/uploads/' + req.file.filename;

        // Insert deposit
        const result = db.prepare(`
            INSERT INTO deposits (user_id, amount, method, proof_image, status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(req.user.id, amt, method, proofPath);

        // Buat order record
        const orderId = '#ZPR-' + Date.now() + '-' + req.user.id;
        db.prepare(`
            INSERT INTO orders (order_id, user_id, type, service_name, price, status)
            VALUES (?, ?, 'deposit', ?, ?, 'pending')
        `).run(orderId, req.user.id, `Deposit via ${method}`, amt);

        res.json({
            success: true,
            message: 'Deposit diajukan. Menunggu persetujuan admin.',
            depositId: result.lastInsertRowid,
            orderId
        });
    } catch (err) {
        console.error('Deposit error:', err);
        res.status(500).json({ success: false, message: 'Gagal submit deposit: ' + err.message });
    }
});

// ============================================
// GET /api/deposit/my
// User lihat riwayat deposit sendiri
// ============================================
router.get('/my', authRequired, (req, res) => {
    try {
        const list = db.prepare(`
            SELECT id, amount, method, proof_image, status, note, created_at, approved_at
            FROM deposits WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 50
        `).all(req.user.id);
        res.json({ success: true, deposits: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// GET /api/deposit/pending (admin)
// ============================================
router.get('/pending', adminRequired, (req, res) => {
    try {
        const list = db.prepare(`
            SELECT d.*, u.username, u.display_name
            FROM deposits d
            JOIN users u ON u.id = d.user_id
            WHERE d.status = 'pending'
            ORDER BY d.id ASC
            LIMIT 100
        `).all();
        res.json({ success: true, deposits: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// GET /api/deposit/all (admin)
// ============================================
router.get('/all', adminRequired, (req, res) => {
    try {
        const list = db.prepare(`
            SELECT d.*, u.username, u.display_name
            FROM deposits d
            JOIN users u ON u.id = d.user_id
            ORDER BY d.id DESC
            LIMIT 200
        `).all();
        res.json({ success: true, deposits: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// POST /api/deposit/:id/approve (admin)
// ============================================
router.post('/:id/approve', adminRequired, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(id);

        if (!deposit) {
            return res.status(404).json({ success: false, message: 'Deposit tidak ditemukan' });
        }
        if (deposit.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Deposit sudah diproses' });
        }

        const tx = db.transaction(() => {
            // Update deposit status
            db.prepare(`
                UPDATE deposits SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
                WHERE id = ?
            `).run(req.user.id, id);

            // Tambah saldo user
            db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?')
              .run(deposit.amount, deposit.user_id);

            // Update order terkait
            db.prepare(`
                UPDATE orders SET status = 'success'
                WHERE user_id = ? AND type = 'deposit' AND price = ? AND status = 'pending'
            `).run(deposit.user_id, deposit.amount);
        });

        tx();
        res.json({ success: true, message: 'Deposit disetujui, saldo ditambahkan' });
    } catch (err) {
        console.error('Approve error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// POST /api/deposit/:id/reject (admin)
// ============================================
router.post('/:id/reject', adminRequired, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { note } = req.body;
        const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(id);

        if (!deposit) {
            return res.status(404).json({ success: false, message: 'Tidak ditemukan' });
        }
        if (deposit.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Sudah diproses' });
        }

        db.prepare(`
            UPDATE deposits SET status = 'rejected', note = ?, approved_at = CURRENT_TIMESTAMP, approved_by = ?
            WHERE id = ?
        `).run(note || 'Ditolak admin', req.user.id, id);

        db.prepare(`
            UPDATE orders SET status = 'failed'
            WHERE user_id = ? AND type = 'deposit' AND price = ? AND status = 'pending'
        `).run(deposit.user_id, deposit.amount);

        res.json({ success: true, message: 'Deposit ditolak' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;