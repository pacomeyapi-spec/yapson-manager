const path = require('path');
const fs = require('fs');

let db;

function getDb() {
  if (db) return db;
  
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/manager.db');
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  initSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      depot_pct REAL NOT NULL DEFAULT 4.0,
      retrait_pct REAL NOT NULL DEFAULT 2.0,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      type_shift TEXT NOT NULL DEFAULT 'jour',
      pct_depot REAL NOT NULL DEFAULT 1.2,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employe_sites (
      employe_id INTEGER NOT NULL,
      site_id INTEGER NOT NULL,
      PRIMARY KEY (employe_id, site_id),
      FOREIGN KEY (employe_id) REFERENCES employes(id),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS sessions_journee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      site_id INTEGER NOT NULL,
      volume_depot REAL NOT NULL DEFAULT 0,
      volume_retrait REAL NOT NULL DEFAULT 0,
      commission_depot REAL NOT NULL DEFAULT 0,
      commission_retrait REAL NOT NULL DEFAULT 0,
      total_commission REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS performances_employe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      employe_id INTEGER NOT NULL,
      site_id INTEGER NOT NULL,
      volume_depot REAL NOT NULL DEFAULT 0,
      remuneration REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employe_id) REFERENCES employes(id),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );
  `);
}

module.exports = { getDb };
