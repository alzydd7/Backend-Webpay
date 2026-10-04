// server.js — Entry point backend ziperrPAY (Vercel Edition)
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { db } = require('./database');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend dari public/
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/deposit', require('./routes/deposit'));
app.use('/api/nokos', require('./routes/nokos'));
app.use('/api/suntik', require('./routes/suntik'));
app.use('/api/script', require('./routes/script'));
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Config publik
app.get('/api/config/public', (req, res) => {
    const { getSetting } = require('./database');
    
    // Parse banks dari settings
    let banks = [];
    try {
        const banksRaw = getSetting('banks');
        if (banksRaw) banks = JSON.parse(banksRaw);
    } catch(e) {}
    
    let ewallets = [];
    try {
        const ewalletsRaw = getSetting('ewallets');
        if (ewalletsRaw) ewallets = JSON.parse(ewalletsRaw);
    } catch(e) {}

    res.json({
        payment: {
            qris: {
                merchantName: getSetting('qris_merchant', config.payment.qris.merchantName),
                imageUrl: getSetting('qris_image', config.payment.qris.imageUrl)
            },
            banks: banks.length ? banks : config.payment.banks,
            ewallets: ewallets.length ? ewallets : config.payment.ewallets
        },
        deposit: config.deposit,
        turnstile: {
            enabled: config.turnstile.enabled,
            siteKey: config.turnstile.siteKey
        },
        nokos: { enabled: !!(getSetting('nokos_apiKey') || config.nokos.apiKey) },
        suntik: { enabled: !!(getSetting('suntik_apiKey') || config.suntik.apiKey) }
    });
});

// Kalau dijalankan lokal, tetap listen. Vercel ambil module.exports.
if (require.main === module) {
    const PORT = process.env.PORT || config.port;
    app.listen(PORT, () => {
        console.log(`ziperrPAY running on port ${PORT}`);
    });
}

module.exports = app;