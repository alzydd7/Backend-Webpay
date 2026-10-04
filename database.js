function setupAdmin() {
    try {
        const adminUser = config.admin.username;
        const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(adminUser);
        
        if (!existing) {
            const hash = bcrypt.hashSync(config.admin.password, 10);
            db.prepare(`
                INSERT INTO users (username, password, display_name, role, balance)
                VALUES (?, ?, ?, 'admin', 0)
            `).run(adminUser, hash, 'Administrator');
            console.log('✅ Admin account created:', adminUser);
        }
    } catch (err) {
        console.log('⚠️ Setup admin skipped:', err.message);
    }
}

setupAdmin();