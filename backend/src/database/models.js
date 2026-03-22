import db from './schema.js';
import { v4 as uuidv4 } from 'uuid';

export const SettingsModel = {
  get() {
    return db.prepare('SELECT * FROM settings WHERE id = 1').get();
  },

  update(updates) {
    // Security: Filter out masked fields so we don't accidentally overwrite real secrets
    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'string' && value.includes('********')) {
        continue;
      }
      filteredUpdates[key] = value;
    }

    const fields = Object.keys(filteredUpdates);
    if (fields.length === 0) return;

    const values = Object.values(filteredUpdates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    
    return db.prepare(`UPDATE settings SET ${setClause} WHERE id = 1`).run(...values);
  }
};

export const EmailModel = {
  create(email) {
    const id = uuidv4();
    const timestamp = email.timestamp instanceof Date ? email.timestamp.toISOString() : email.timestamp;
    db.prepare(`
      INSERT INTO emails (
        id, source, message_id, from_email, to_emails,
        subject, body, summary, timestamp, read, starred, labels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, email.source, email.message_id, email.from_email,
      JSON.stringify(email.to_emails), email.subject, email.body,
      email.summary, timestamp, email.read ? 1 : 0,
      email.starred ? 1 : 0, JSON.stringify(email.labels || [])
    );
    return id;
  },

  getAll(limit = 50, offset = 0) {
    const emails = db.prepare(`
      SELECT * FROM emails 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    
    return emails.map(e => ({
      ...e,
      to_emails: JSON.parse(e.to_emails),
      labels: JSON.parse(e.labels),
      read: !!e.read,
      starred: !!e.starred
    }));
  },

  getById(id) {
    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!email) return null;
    
    return {
      ...email,
      to_emails: JSON.parse(email.to_emails),
      labels: JSON.parse(email.labels),
      read: !!email.read,
      starred: !!email.starred
    };
  },

  getByMessageId(messageId) {
    const email = db.prepare('SELECT * FROM emails WHERE message_id = ?').get(messageId);
    if (!email) return null;
    
    return {
      ...email,
      to_emails: JSON.parse(email.to_emails),
      labels: JSON.parse(email.labels),
      read: !!email.read,
      starred: !!email.starred
    };
  },

  update(id, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    
    return db.prepare(`UPDATE emails SET ${setClause} WHERE id = ?`).run(...values, id);
  },

  delete(id) {
    return db.prepare('DELETE FROM emails WHERE id = ?').run(id);
  },

  markAsRead(id) {
    return db.prepare('UPDATE emails SET read = 1 WHERE id = ?').run(id);
  },

  toggleStar(id) {
    const email = db.prepare('SELECT starred FROM emails WHERE id = ?').get(id);
    const newStar = email.starred ? 0 : 1;
    return db.prepare('UPDATE emails SET starred = ? WHERE id = ?').run(newStar, id);
  },

  count() {
    return db.prepare('SELECT COUNT(*) as count FROM emails').get();
  }
};

export const StatsModel = {
  get() {
    return db.prepare('SELECT * FROM stats WHERE id = 1').get();
  },

  increment(field) {
    const whitelist = [
      'emails_processed', 'emails_sent', 'emails_summarized', 
      'auto_replies_sent', 'human_approvals', 'human_rejections'
    ];
    if (!whitelist.includes(field)) {
      throw new Error(`Invalid stat field: ${field}`);
    }
    return db.prepare(`UPDATE stats SET ${field} = ${field} + 1 WHERE id = 1`).run();
  },

  updateLastCheck() {
    return db.prepare('UPDATE stats SET last_check = CURRENT_TIMESTAMP WHERE id = 1').run();
  }
};

export const MemoryModel = {
  create(memory) {
    const id = uuidv4();
    const timestamp = (memory.timestamp instanceof Date ? memory.timestamp.toISOString() : memory.timestamp) || new Date().toISOString();
    db.prepare(`
      INSERT INTO memory (id, type, content, timestamp, related_email_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, memory.type, memory.content, timestamp, memory.related_email_id || null);
    return id;
  },

  getAll(type = null, limit = 100) {
    if (type) {
      return db.prepare(`
        SELECT * FROM memory 
        WHERE type = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(type, limit);
    }
    return db.prepare(`
      SELECT * FROM memory 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(limit);
  },

  search(query, limit = 20) {
    return db.prepare(`
      SELECT * FROM memory 
      WHERE content LIKE ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(`%${query}%`, limit);
  },

  update(id, content) {
    return db.prepare('UPDATE memory SET content = ? WHERE id = ?').run(content, id);
  },

  delete(id) {
    return db.prepare('DELETE FROM memory WHERE id = ?').run(id);
  },

  clearAll() {
    return db.prepare('DELETE FROM memory').run();
  }
};

export const PendingActionModel = {
  create(action) {
    const id = uuidv4();
    const timestamp = (action.timestamp instanceof Date ? action.timestamp.toISOString() : action.timestamp) || new Date().toISOString();
    db.prepare(`
      INSERT INTO pending_actions (id, type, email_id, reply_content, status, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, action.type, action.email_id, action.reply_content, action.status, timestamp);
    return id;
  },

  getAll(status = null) {
    if (status) {
      return db.prepare(`
        SELECT * FROM pending_actions 
        WHERE status = ? 
        ORDER BY timestamp DESC
      `).all(status);
    }
    return db.prepare(`
      SELECT * FROM pending_actions 
      ORDER BY timestamp DESC
    `).all();
  },

  getById(id) {
    return db.prepare('SELECT * FROM pending_actions WHERE id = ?').get(id);
  },

  updateStatus(id, status) {
    return db.prepare('UPDATE pending_actions SET status = ? WHERE id = ?').run(status, id);
  },

  delete(id) {
    return db.prepare('DELETE FROM pending_actions WHERE id = ?').run(id);
  }
};
