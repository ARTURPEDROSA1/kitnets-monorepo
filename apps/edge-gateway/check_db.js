const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data/kitnets-gateway.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM daily_snapshots ORDER BY date DESC LIMIT 10", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
});
