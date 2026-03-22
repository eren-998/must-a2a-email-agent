import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', '..', '..', 'data', 'agent.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function ensureSettingsColumns() {
  const cols = db.prepare("PRAGMA table_info(settings)").all();
  const names = new Set(cols.map(c => c.name));

  const addColumnIfMissing = (name, sqlTypeAndDefault) => {
    if (names.has(name)) return;
    db.exec(`ALTER TABLE settings ADD COLUMN ${name} ${sqlTypeAndDefault};`);
  };

  addColumnIfMissing('active_email_provider', "TEXT DEFAULT 'gmail'");
  addColumnIfMissing('daily_summary_enabled', 'INTEGER DEFAULT 0');
  addColumnIfMissing('daily_summary_time', "TEXT DEFAULT '09:00'");
  addColumnIfMissing('custom_ai_endpoint', 'TEXT');
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      telegram_bot_token TEXT,
      telegram_chat_id TEXT,
      gmail_client_id TEXT,
      gmail_client_secret TEXT,
      gmail_refresh_token TEXT,
      outlook_client_id TEXT,
      outlook_client_secret TEXT,
      outlook_refresh_token TEXT,
      custom_imap_host TEXT,
      custom_imap_port INTEGER,
      custom_smtp_host TEXT,
      custom_smtp_port INTEGER,
      custom_email TEXT,
      custom_password TEXT,
      active_email_provider TEXT DEFAULT 'gmail',
      ai_provider TEXT,
      ai_api_key TEXT,
      ai_model TEXT,
      system_instructions TEXT,
      custom_ai_endpoint TEXT,
      auto_reply_enabled INTEGER DEFAULT 0,
      auto_reply_tags TEXT,
      auto_reply_template TEXT,
      human_in_loop INTEGER DEFAULT 0,
      email_check_interval INTEGER DEFAULT 5,
      daily_summary_enabled INTEGER DEFAULT 0,
      daily_summary_time TEXT DEFAULT '09:00'
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      message_id TEXT NOT NULL,
      from_email TEXT NOT NULL,
      to_emails TEXT,
      subject TEXT,
      body TEXT,
      summary TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      read INTEGER DEFAULT 0,
      starred INTEGER DEFAULT 0,
      labels TEXT
    );

    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      emails_processed INTEGER DEFAULT 0,
      emails_sent INTEGER DEFAULT 0,
      emails_summarized INTEGER DEFAULT 0,
      auto_replies_sent INTEGER DEFAULT 0,
      human_approvals INTEGER DEFAULT 0,
      human_rejections INTEGER DEFAULT 0,
      last_check DATETIME
    );

    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      related_email_id TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      email_id TEXT NOT NULL,
      reply_content TEXT,
      status TEXT DEFAULT 'pending',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON emails(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_emails_source ON emails(source);
    CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
  `);

  ensureSettingsColumns();

  const settings = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settings.count === 0) {
    db.prepare(`
      INSERT INTO settings (
        telegram_bot_token, telegram_chat_id,
        gmail_client_id, gmail_client_secret,
        outlook_client_id, outlook_client_secret,
        custom_imap_host, custom_imap_port,
        custom_smtp_host, custom_smtp_port,
        custom_email, custom_password,
        active_email_provider,
        ai_provider, ai_api_key, ai_model,
        system_instructions, custom_ai_endpoint, auto_reply_enabled,
        auto_reply_tags, auto_reply_template,
        human_in_loop, email_check_interval,
        daily_summary_enabled, daily_summary_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '', '', '', '', '', '', '', 993, '', 587, '', '',
      'gmail',
      'openai', '', 'gpt-4-turbo-preview',
      'You are a helpful email assistant. Summarize emails concisely and help manage the inbox efficiently.',
      '', 0, 'support,info,query',
      'Thank you for your email. I have received it and will get back to you shortly.',
      1, 5,
      0, '09:00'
    );
  }

  const stats = db.prepare('SELECT COUNT(*) as count FROM stats').get();
  if (stats.count === 0) {
    db.prepare(`
      INSERT INTO stats (
        emails_processed, emails_sent, emails_summarized,
        auto_replies_sent, human_approvals, human_rejections
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(0, 0, 0, 0, 0, 0);
  }
}

initDatabase();

export default db;
