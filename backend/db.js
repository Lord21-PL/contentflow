const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // W środowisku produkcyjnym na Railway, SSL jest wymagany.
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    // Istniejąca funkcja do prostych zapytań
    query: (text, params) => pool.query(text, params),

    // NOWA, BRAKUJĄCA FUNKCJA do pobierania klienta dla transakcji
    getClient: () => pool.connect(),
};