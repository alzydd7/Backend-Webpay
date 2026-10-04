module.exports = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET || 'ganti-ini-string-acak-panjang-12345',
    
    admin: {
        username: 'alzydd7',
        password: '123'
    },

    nokos: {
        provider: '', apiKey: '', baseUrl: '',
        markupPercent: 15, minProfit: 500, adminFee: 200,
        enabled: false
    },

    suntik: {
        provider: '', apiKey: '', userId: '', baseUrl: '',
        markupPercent: 20, minProfit: 1000,
        enabled: false
    },

    payment: {
        qris: { imageUrl: '', merchantName: 'ziperrPAY', nmid: '' },
        banks: [
            { code: 'BCA', name: 'Bank BCA', accountNumber: '', accountName: '' },
            { code: 'BRI', name: 'Bank BRI', accountNumber: '', accountName: '' }
        ],
        ewallets: [
            { code: 'DANA', name: 'DANA', accountNumber: '', accountName: '' },
            { code: 'OVO', name: 'OVO', accountNumber: '', accountName: '' },
            { code: 'GOPAY', name: 'GoPay', accountNumber: '', accountName: '' }
        ]
    },

    deposit: {
        minAmount: 1000,
        maxAmount: 50000000
    },

    turnstile: {
        enabled: false,
        siteKey: '',
        secretKey: ''
    }
};