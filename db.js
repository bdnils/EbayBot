// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost', // Dein MySQL-Host (oft localhost)
    user: 'scraper', // Dein MySQL-Benutzername
    password: '12345678', // Dein MySQL-Passwort
    database: 'ebaybot', // Name deiner Datenbank
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Testverbindung (optional, aber gut für die Entwicklung)
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Successfully connected to the database.');
        connection.release();
    } catch (error) {
        console.error('❌ Error connecting to the database:', error);
    }
}
testConnection();


module.exports = pool;