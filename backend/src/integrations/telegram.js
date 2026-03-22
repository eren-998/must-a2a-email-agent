import TelegramBot from 'node-telegram-bot-api';
import { SettingsModel, EmailModel, PendingActionModel, StatsModel, MemoryModel } from '../database/models.js';
import AIProvider from '../ai/providers.js';
import GmailIntegration from './gmail.js';
import OutlookIntegration from './outlook.js';
import CustomDomainIntegration from './custom.js';

class TelegramIntegration {
  constructor() {
    this.bot = null;
    this.chatId = null;
    this.token = null;
    this._pendingEdit = null; // Tracks when user is editing a pending reply
  }

  // ─── INIT / STOP ──────────────────────────────────────────
  async init() {
    const settings = await SettingsModel.get();
    if (!settings.telegram_bot_token) {
      console.log('Telegram bot token not configured');
      return;
    }
    if (this.bot && this.token === settings.telegram_bot_token) {
      this.chatId = settings.telegram_chat_id;
      return;
    }
    await this.stop();
    this.bot = new TelegramBot(settings.telegram_bot_token, { polling: true });
    this.chatId = settings.telegram_chat_id;
    this.token = settings.telegram_bot_token;
    this.setupCommands();
    console.log('Telegram bot initialized');
  }

  async stop() {
    if (!this.bot) return;
    try { await this.bot.stopPolling(); } catch (e) { /* ignore */ }
    this.bot = null;
    this.token = null;
  }

  // ─── UTILITIES ────────────────────────────────────────────

  // Escape user content for Telegram HTML parse mode
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Extract a clean email address from "Name <email@domain.com>" or "email@domain.com"
  extractEmailAddress(raw) {
    if (!raw) return '';
    const match = raw.match(/<([^>]+)>/);
    if (match) return match[1].trim();
    return raw.trim();
  }

  // Safe send: HTML first, fallback to plain text
  async safeSend(chatId, html, options = {}) {
    try {
      return await this.bot.sendMessage(chatId, html, { parse_mode: 'HTML', ...options });
    } catch (e) {
      const plain = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      return await this.bot.sendMessage(chatId, plain, { ...options, reply_markup: undefined });
    }
  }

  // Get the configured email integration (gmail/outlook/custom)
  async getEmailIntegration() {
    const settings = await SettingsModel.get();
    if (settings.gmail_client_id && settings.gmail_refresh_token) return { integration: GmailIntegration, source: 'gmail' };
    if (settings.outlook_client_id && settings.outlook_refresh_token) return { integration: OutlookIntegration, source: 'outlook' };
    if (settings.custom_email && settings.custom_password) return { integration: CustomDomainIntegration, source: 'custom' };
    return null;
  }

  // ─── REGISTER COMMANDS ──────────────────────────────────────
  setupCommands() {
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bot.onText(/\/summary/, (msg) => this.handleSummary(msg));
    this.bot.onText(/\/read (.+)/, (msg, match) => this.handleReadEmail(msg, match));
    this.bot.onText(/\/send (.+)/, (msg, match) => this.handleSend(msg, match));
    this.bot.onText(/\/approve (.+)/, (msg, match) => this.handleApprove(msg, match));
    this.bot.onText(/\/reject (.+)/, (msg, match) => this.handleReject(msg, match));
    this.bot.onText(/\/clear/, (msg) => this.handleClear(msg));

    // Inline keyboard button presses
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));

    // All non-command messages → conversational AI & Intent detection
    this.bot.on('message', (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        this.handleMessage(msg);
      }
    });
  }

  // ─── INLINE BUTTON HANDLER ────────────────────────────────
  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data || '';

    try {
      const colonIdx = data.indexOf(':');
      const action = data.substring(0, colonIdx);
      const actionId = data.substring(colonIdx + 1);

      if (action === 'approve') {
        const pending = await PendingActionModel.getById(actionId);
        if (!pending) {
          await this.bot.answerCallbackQuery(query.id, { text: '⚠️ Action no longer exists.' });
          return;
        }
        const email = await EmailModel.getById(pending.email_id);
        if (!email) {
          await this.bot.answerCallbackQuery(query.id, { text: '⚠️ Email not found.' });
          return;
        }
        const provider = await this.getEmailIntegration();
        if (!provider) {
          await this.bot.answerCallbackQuery(query.id, { text: '⚠️ No email provider configured.' });
          return;
        }
        const toAddress = this.extractEmailAddress(email.from_email);
        await provider.integration.sendEmail(toAddress, `Re: ${email.subject}`, pending.reply_content);
        await PendingActionModel.updateStatus(actionId, 'approved');
        await StatsModel.increment('auto_replies_sent');
        await StatsModel.increment('human_approvals');

        const doneHtml = `✅ <b>Reply Sent!</b>\n\nReplied to <b>${this.escapeHtml(email.from_email)}</b>\nSubject: <i>${this.escapeHtml(email.subject)}</i>`;
        try {
          await this.bot.editMessageText(doneHtml, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' });
        } catch (e) {
          await this.safeSend(chatId, doneHtml);
        }
        await this.bot.answerCallbackQuery(query.id, { text: '✅ Reply sent!' });

      } else if (action === 'reject') {
        const pending = await PendingActionModel.getById(actionId);
        if (!pending) {
          await this.bot.answerCallbackQuery(query.id, { text: '⚠️ Action no longer exists.' });
          return;
        }
        const email = await EmailModel.getById(pending.email_id);
        await PendingActionModel.updateStatus(actionId, 'rejected');
        await StatsModel.increment('human_rejections');

        const cancelHtml = `❌ <b>Reply Discarded</b>\n\nDid not reply to "<i>${this.escapeHtml(email?.subject || 'Unknown')}</i>".`;
        try {
          await this.bot.editMessageText(cancelHtml, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' });
        } catch (e) {
          await this.safeSend(chatId, cancelHtml);
        }
        await this.bot.answerCallbackQuery(query.id, { text: '❌ Reply discarded.' });

      } else if (action === 'edit') {
        this._pendingEdit = actionId;
        await this.bot.answerCallbackQuery(query.id, { text: '✏️ Send your edited reply as a message.' });
        await this.safeSend(chatId, `✏️ <b>Edit Mode Active</b>\n\nType your revised reply as your next message and I'll ask for final approval.`);

      } else if (action === 'delete') {
        const email = await EmailModel.getById(actionId);
        if (!email) {
          await this.bot.answerCallbackQuery(query.id, { text: '⚠️ Email not found.' });
          return;
        }
        const provider = await this.getEmailIntegration();
        if (typeof provider?.integration?.deleteEmail === 'function') {
          await provider.integration.deleteEmail(email.message_id);
        }
        await EmailModel.delete(email.id);
        await this.safeSend(chatId, `🗑️ Deleted email: "${this.escapeHtml(email.subject)}"`);
        await this.bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        await this.bot.answerCallbackQuery(query.id, { text: '🗑️ Deleted!' });

      } else if (action === 'star') {
        const email = await EmailModel.getById(actionId);
        if (!email) return;
        const provider = await this.getEmailIntegration();
        if (typeof provider?.integration?.starEmail === 'function') {
          await provider.integration.starEmail(email.message_id);
        }
        await EmailModel.toggleStar(email.id);
        await this.safeSend(chatId, `⭐ Starred email: "${this.escapeHtml(email.subject)}"`);
        await this.bot.answerCallbackQuery(query.id, { text: '⭐ Starred!' });

      } else if (action === 'markread') {
        const email = await EmailModel.getById(actionId);
        if (!email) return;
        await EmailModel.markAsRead(email.id);
        const provider = await this.getEmailIntegration();
        if (typeof provider?.integration?.markAsRead === 'function') {
          await provider.integration.markAsRead(email.message_id).catch(() => {});
        }
        await this.safeSend(chatId, `👁️ Marked as read: "${this.escapeHtml(email.subject)}"`);
        await this.bot.answerCallbackQuery(query.id, { text: '👁️ Read!' });
      }
    } catch (error) {
      console.error('Callback query error:', error);
      try { await this.bot.answerCallbackQuery(query.id, { text: `Error: ${error.message}` }); } catch (e) {}
    }
  }

  // ─── /start ───────────────────────────────────────────────
  async handleStart(msg) {
    const chatId = msg.chat.id;
    try {
      const settings = await SettingsModel.get();
      if (!settings.telegram_chat_id || settings.telegram_chat_id !== String(chatId)) {
        await SettingsModel.update({ telegram_chat_id: String(chatId) });
      }
      this.chatId = String(chatId);
    } catch (error) {
      console.error('Failed to save chat id:', error.message);
    }
    await this.safeSend(chatId,
      `🤖 <b>AI Email Agent — Online</b>\n\n` +
      `Hey! I'm your personal AI email assistant.\n\n` +
      `I can read, summarize, reply to, star, delete and manage your emails — all from right here in Telegram.\n\n` +
      `Just talk to me naturally and I'll handle the rest. 💬`
    );
  }

  // ─── /summary ─────────────────────────────────────────────
  async handleSummary(msg) {
    const chatId = msg.chat.id;
    const emails = await EmailModel.getAll(5);
    if (emails.length === 0) {
      await this.safeSend(chatId, '📭 Your inbox is empty — no emails to summarize.');
      return;
    }
    let html = '📋 <b>Inbox Summary</b>\n━━━━━━━━━━━━━━━━━━\n\n';
    emails.forEach((email, i) => {
      html += `<b>${i + 1}.</b> ${this.escapeHtml(email.subject || '(No Subject)')}\n`;
      html += `    📨 <i>${this.escapeHtml(email.from_email)}</i>\n`;
      html += `    💡 ${this.escapeHtml(email.summary || 'No summary yet')}\n\n`;
    });
    await this.safeSend(chatId, html);
  }

  // ─── /read <id> ───────────────────────────────────────────
  async handleReadEmail(msg, match) {
    const chatId = msg.chat.id;
    const emailId = match[1].trim();
    const email = await EmailModel.getById(emailId);
    if (!email) {
      await this.safeSend(chatId, '❌ Email not found.');
      return;
    }
    await EmailModel.markAsRead(emailId);
    const html =
      `📧 <b>Email Details</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
      `<b>Subject:</b> ${this.escapeHtml(email.subject)}\n` +
      `<b>From:</b> ${this.escapeHtml(email.from_email)}\n` +
      `<b>Time:</b> ${new Date(email.timestamp).toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${this.escapeHtml((email.body || '').substring(0, 3500))}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💡 <b>AI Summary:</b> ${this.escapeHtml(email.summary || 'Not available')}`;
    await this.safeSend(chatId, html);
  }

  // ─── /send ────────────────────────────────────────────────
  async handleSend(msg, match) {
    const chatId = msg.chat.id;
    const input = match[1];
    const regex = /^([^\s]+)\s+"([^"]+)"\s+(.+)$/s;
    const parts = input.match(regex);
    let to, subject, body;
    if (parts) {
      [, to, subject, body] = parts;
    } else {
      const args = input.split(' ');
      to = args[0]; subject = args[1]; body = args.slice(2).join(' ');
    }
    if (!to || !subject || !body) {
      await this.safeSend(chatId, `❌ <b>Usage:</b> <code>/send email@example.com "Subject" Body text here</code>`);
      return;
    }
    const provider = await this.getEmailIntegration();
    if (!provider) {
      await this.safeSend(chatId, '❌ No email provider configured in Settings.');
      return;
    }
    try {
      await provider.integration.sendEmail(this.extractEmailAddress(to), subject, body);
      await StatsModel.increment('emails_sent');
      await this.safeSend(chatId,
        `✅ <b>Email Sent</b>\n\n<b>To:</b> ${this.escapeHtml(to)}\n<b>Subject:</b> ${this.escapeHtml(subject)}`
      );
    } catch (error) {
      await this.safeSend(chatId, `❌ <b>Send failed:</b> ${this.escapeHtml(error.message)}`);
    }
  }

  // ─── /clear (Wipe memory) ───────────────────────────────
  async handleClear(msg) {
    const chatId = msg.chat.id;
    await MemoryModel.clearAll();
    await this.safeSend(chatId, '🧹 <b>Memory Cleared!</b>\n\nI have forgotten our past conversations and preferences.');
  }

  // ─── /approve <id> (text fallback) ──────────────────────
  async handleApprove(msg, match) {
    const chatId = msg.chat.id;
    const actionId = match[1].trim();
    const action = await PendingActionModel.getById(actionId);
    if (!action) { await this.safeSend(chatId, '❌ Action not found or already processed.'); return; }
    const email = await EmailModel.getById(action.email_id);
    if (!email) { await this.safeSend(chatId, '❌ Original email not found.'); return; }
    const provider = await this.getEmailIntegration();
    if (!provider) { await this.safeSend(chatId, '❌ No email provider configured.'); return; }
    try {
      const toAddress = this.extractEmailAddress(email.from_email);
      await provider.integration.sendEmail(toAddress, `Re: ${email.subject}`, action.reply_content);
      await PendingActionModel.updateStatus(actionId, 'approved');
      await StatsModel.increment('auto_replies_sent');
      await StatsModel.increment('human_approvals');
      await this.safeSend(chatId, `✅ <b>Reply Sent</b> to <b>${this.escapeHtml(email.from_email)}</b>`);
    } catch (error) {
      await this.safeSend(chatId, `❌ <b>Failed:</b> ${this.escapeHtml(error.message)}`);
    }
  }

  // ─── /reject <id> (text fallback) ────────────────────────
  async handleReject(msg, match) {
    const chatId = msg.chat.id;
    const actionId = match[1].trim();
    const action = await PendingActionModel.getById(actionId);
    if (!action) { await this.safeSend(chatId, '❌ Action not found.'); return; }
    await PendingActionModel.updateStatus(actionId, 'rejected');
    await StatsModel.increment('human_rejections');
    await this.safeSend(chatId, '❌ <b>Reply Discarded.</b>');
  }

  // ─── NEW EMAIL NOTIFICATION ───────────────────────────────
  async notifyNewEmail(email) {
    if (!this.bot || !this.chatId) return;
    const html =
      `📬 <b>New Email Received</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
      `<b>From:</b>  ${this.escapeHtml(email.from_email || 'Unknown')}\n` +
      `<b>Subject:</b>  ${this.escapeHtml(email.subject || '(No Subject)')}\n` +
      `<b>Time:</b>  ${new Date(email.timestamp).toLocaleString()}\n\n` +
      `💡 <b>Summary:</b>\n${this.escapeHtml(email.summary || 'Processing...')}`;
    await this.safeSend(this.chatId, html);
  }

  // ─── AUTO-REPLY PENDING — MANAGER-STYLE ──────────────────
  async notifyAutoReplyPending(action, email) {
    if (!this.bot || !this.chatId) return;
    const from = this.escapeHtml(email.from_email || 'Unknown');
    const subj = this.escapeHtml(email.subject || '(No Subject)');
    const summary = this.escapeHtml(email.summary || '');
    const reply = this.escapeHtml(action.reply_content || '');

    const html =
      `📩 <b>New Email — Your Approval Needed</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
      `You received an email from <b>${from}</b>\n` +
      `Subject: <i>${subj}</i>\n\n` +
      (summary ? `💡 <b>What it says:</b>\n${summary}\n\n` : '') +
      `✍️ <b>My Proposed Reply:</b>\n<pre>${reply}</pre>\n\n` +
      `Should I send this, or would you like to change it?`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Send Reply', callback_data: `approve:${action.id}` },
            { text: '❌ Discard', callback_data: `reject:${action.id}` }
          ],
          [{ text: '✏️ Edit Reply', callback_data: `edit:${action.id}` }]
        ]
      }
    };
    await this.safeSend(this.chatId, html, keyboard);
  }

  // ─── ERROR NOTIFICATION ───────────────────────────────────
  async notifyError(error) {
    if (!this.bot || !this.chatId) return;
    await this.safeSend(this.chatId, `⚠️ <b>System Alert:</b> ${this.escapeHtml(error.message)}`);
  }

  // ─── EXECUTE TOOL ACTION ──────────────────────────────────
  // Central method that runs a single parsed tool action.
  // Returns { success, message, extraHtml }
  async executeAction(tag, recentEmails, provider, settings) {
    // Pattern: [ACTION:TOOLNAME|arg1|arg2|...]
    const inner = tag.replace(/^\[ACTION:/i, '').replace(/\]$/, '');
    const parts = inner.split(/\s*\|\s*/);
    const tool = (parts[0] || '').toUpperCase().trim();

    const getEmail = (refId) => {
      const id = parseInt(refId, 10);
      if (isNaN(id) || id < 0 || id >= recentEmails.length) return null;
      return recentEmails[id];
    };

    try {
      switch (tool) {

        // ── READ ──────────────────────────────────────────────
        case 'READ': {
          const email = getEmail(parts[1]);
          if (!email) return { success: false, message: 'Email reference not found.' };
          if (!email.read) await EmailModel.markAsRead(email.id);
          const bodySnippet = this.escapeHtml((email.body || '').substring(0, 3000));
          const extraHtml = `\n\n📧 <b>${this.escapeHtml(email.subject)}</b>\n<i>From: ${this.escapeHtml(email.from_email)}</i>\n━━━━━━━━━━━━━━━━━━\n${bodySnippet}`;
          return { success: true, extraHtml };
        }

        // ── REPLY ─────────────────────────────────────────────
        case 'REPLY': {
          if (!provider) return { success: false, message: 'No email provider configured.' };
          const email = getEmail(parts[1]);
          if (!email) return { success: false, message: 'Email reference not found.' };
          const replyBody = parts.slice(2).join('|').trim();
          if (!replyBody) return { success: false, message: 'Reply body is empty.' };
          const toAddress = this.extractEmailAddress(email.from_email);
          if (!toAddress) return { success: false, message: `Could not extract email address from: "${email.from_email}".` };
          await provider.integration.sendEmail(toAddress, `Re: ${email.subject}`, replyBody);
          await StatsModel.increment('emails_sent');
          return { success: true, message: `Replied to ${email.from_email}` };
        }

        // ── SEND ──────────────────────────────────────────────
        case 'SEND': {
          if (!provider) return { success: false, message: 'No email provider configured.' };
          const to = (parts[1] || '').trim();
          const subject = (parts[2] || '').trim();
          const body = parts.slice(3).join('|').trim();
          if (!to || !subject || !body) return { success: false, message: 'SEND requires: to|subject|body.' };
          const toAddress = this.extractEmailAddress(to);
          await provider.integration.sendEmail(toAddress, subject, body);
          await StatsModel.increment('emails_sent');
          return { success: true, message: `Email sent to ${to}` };
        }

        // ── STAR ──────────────────────────────────────────────
        case 'STAR': {
          if (!provider) return { success: false, message: 'No email provider configured.' };
          const email = getEmail(parts[1]);
          if (!email) return { success: false, message: 'Email reference not found.' };
          if (typeof provider.integration.starEmail === 'function') {
            await provider.integration.starEmail(email.message_id);
          }
          await EmailModel.toggleStar(email.id); // update local DB
          return { success: true, message: `Starred "${email.subject}"` };
        }

        // ── UNSTAR ────────────────────────────────────────────
        case 'UNSTAR': {
          if (!provider) return { success: false, message: 'No email provider configured.' };
          const email = getEmail(parts[1]);
          if (!email) return { success: false, message: 'Email reference not found.' };
          if (typeof provider.integration.unstarEmail === 'function') {
            await provider.integration.unstarEmail(email.message_id);
          }
          await EmailModel.toggleStar(email.id);
          return { success: true, message: `Unstarred "${email.subject}"` };
        }

        // ── DELETE ────────────────────────────────────────────
        case 'DELETE': {
          if (!provider) return { success: false, message: 'No email provider configured.' };
          const email = getEmail(parts[1]);
          if (!email) return { success: false, message: 'Email reference not found.' };
          if (typeof provider.integration.deleteEmail === 'function') {
            await provider.integration.deleteEmail(email.message_id);
          }
          await EmailModel.delete(email.id);
          return { success: true, message: `Deleted email: "${email.subject}"` };
        }

        // ── MARKREAD ──────────────────────────────────────────
        case 'MARKREAD': {
          const email = getEmail(parts[1]);
          if (!email) return { success: false, message: 'Email reference not found.' };
          await EmailModel.markAsRead(email.id);
          if (provider && typeof provider.integration.markAsRead === 'function') {
            await provider.integration.markAsRead(email.message_id).catch(() => {});
          }
          return { success: true, message: `Marked as read: "${email.subject}"` };
        }

        default:
          return { success: false, message: `Unknown tool: ${tool}` };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // ─── MAIN CHAT MESSAGE HANDLER (ZERO HALLUCINATION) ───────
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // ── Edit mode: user is providing a revised reply ──
    if (this._pendingEdit) {
      const actionId = this._pendingEdit;
      this._pendingEdit = null;
      try {
        const action = await PendingActionModel.getById(actionId);
        if (action && action.status === 'pending') {
          await PendingActionModel.delete(actionId);
          const email = await EmailModel.getById(action.email_id);
          const newActionId = await PendingActionModel.create({
            type: 'autoReply',
            email_id: action.email_id,
            reply_content: text,
            status: 'pending',
            timestamp: new Date()
          });
          await this.notifyAutoReplyPending({ id: newActionId, reply_content: text }, email);
          return;
        }
      } catch (e) { console.error('Edit mode error:', e); }
    }

    try {
      const settings = await SettingsModel.get();
      const recentEmails = await EmailModel.getAll(5);
      const provider = await this.getEmailIntegration();

      const recentMemory = await MemoryModel.getAll(null, 15);
      const emailCtx = recentEmails.map((e, idx) => ({
        id: idx + 1, // STRICTLY 1-indexed
        subject: e.subject,
        from: e.from_email,
        summary: e.summary
      }));

      // ── Build system context ──
      const ctx = [
        'You are a friendly, highly-capable AI assistant managing emails for your user.',
        'You communicate via Telegram. Be natural, conversational, and direct.',
        'ALWAYS reply in ENGLISH. NEVER use Markdown (no *, **, _).',
        '',
        recentEmails.length > 0 ? `CURRENT INBOX (Email IDs 1 to ${recentEmails.length}):\n${JSON.stringify(emailCtx)}` : 'INBOX: Empty.',
        '',
        recentMemory.length > 0 ? `YOUR MEMORIES ABOUT USER:\n${JSON.stringify(recentMemory.map(m => m.content))}` : '',
        '',
        '━━━ EMAIL TOOLS ━━━',
        'You can perform actions by appending EXACTLY ONE tool tag at the very END of your message.',
        'Only use a tool if the user explicitly asks you to take action on an email (like reading, replying, deleting).',
        '',
        '  [ACTION:READ|id]',
        '  [ACTION:REPLY|id|Exact complete text of the reply]',
        '  [ACTION:SEND|to@email.com|Subject|Body Text]',
        '  [ACTION:STAR|id]',
        '  [ACTION:UNSTAR|id]',
        '  [ACTION:DELETE|id]',
        '  [ACTION:MARKREAD|id]',
        '',
        'RULES FOR TOOLS:',
        '1. "id" MUST be the exact numeric ID (1, 2, 3...) from the CURRENT INBOX above. Never use UUIDs or invent numbers.',
        '2. The action tag will be hidden from the user, so briefly say what you did in your visible text (e.g. "I have replied to John.").',
        '3. Do NOT use tools if the user is just chatting normally.',
      ].filter(line => line !== null).join('\n');

      let typingInterval;
      let response;
      try {
        await this.bot.sendChatAction(chatId, 'typing');
        typingInterval = setInterval(() => { this.bot.sendChatAction(chatId, 'typing').catch(() => {}); }, 4000);
        response = await AIProvider.generateChatResponse(text, ctx);
      } finally {
        if (typingInterval) clearInterval(typingInterval);
      }

      await MemoryModel.create({
        type: 'conversation',
        content: `User: ${text}\nAI: ${response}`,
        timestamp: new Date()
      });

      // ── Parse ALL action tags from AI response ──
      const actionTagRegex = /\[ACTION:[A-Z]+(?:\s*\|[^\]]*)?]/gi;
      const tags = response.match(actionTagRegex) || [];
      let displayResponse = response.replace(actionTagRegex, '').trim();

      // ── Execute Actions ──
      let extraHtml = '';
      const results = [];

      for (const tag of tags) {
        // Adjust the tag string to pass 0-indexed ID back to executeAction, 
        // since executeAction expects indices for `recentEmails` array.
        // Or we can modify executeAction to expect 1-based, but let's just 
        // map the ID down by 1 right here before calling executeAction.
        let parsedTag = tag;
        try {
          const inner = tag.replace(/^\[ACTION:/i, '').replace(/\]$/, '');
          const parts = inner.split(/\s*\|\s*/);
          const tool = (parts[0] || '').toUpperCase().trim();
          if (['READ', 'REPLY', 'STAR', 'UNSTAR', 'DELETE', 'MARKREAD'].includes(tool)) {
            let id = parseInt(parts[1], 10);
            if (!isNaN(id)) {
              parts[1] = (id - 1).toString(); // map 1-based to 0-based index
              parsedTag = `[ACTION:${parts.join('|')}]`;
            }
          }
        } catch(e) {}

        if (tag.toUpperCase().includes('REPLY')) {
            // Intercept REPLY commands to ask for manual user approval instead of sending directly
            const inner = parsedTag.replace(/^\[ACTION:/i, '').replace(/\]$/, '');
            const parts = inner.split(/\s*\|\s*/);
            const idx = parseInt(parts[1], 10);
            const email = recentEmails[idx];
            if (email) {
                const replyBody = parts.slice(2).join('|').trim();
                const pendingId = await PendingActionModel.create({
                    type: 'autoReply',
                    email_id: email.id,
                    reply_content: replyBody,
                    status: 'pending',
                    timestamp: new Date()
                });
                await this.notifyAutoReplyPending({ id: pendingId, reply_content: replyBody }, email);
                displayResponse = "I have drafted a reply for your approval.";
                continue; 
            }
        }

        const result = await this.executeAction(parsedTag, recentEmails, provider, settings);
        results.push(result);
        if (result.extraHtml) extraHtml += result.extraHtml;
      }

      // Send AI response purely as text
      const finalHtml = this.escapeHtml(displayResponse) + extraHtml;
      try {
        await this.bot.sendMessage(chatId, finalHtml, { parse_mode: 'HTML' });
      } catch (e) {
        const plain = finalHtml.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        await this.bot.sendMessage(chatId, plain);
      }

      // ── Report action results ──
      for (const result of results) {
        if (result.message) {
          if (result.success) {
            await this.safeSend(chatId, `✅ <b>Action Successful:</b> ${this.escapeHtml(result.message)}`);
          } else {
            await this.safeSend(chatId, `❌ <b>Action Failed:</b> ${this.escapeHtml(result.message)}`);
          }
        }
      }

      // Memory Extraction (Background)
      Promise.resolve().then(async () => {
        try {
          const check = await AIProvider.generateReply(
            `Does this message contain any permanent, important user preference or fact worth remembering? ` +
            `Examples that SHOULD be saved: "My boss is John". Examples that NOT be saved: "hi", "reply". ` +
            `Output ONE short fact (max 15 words). Otherwise output exactly: NONE\n` +
            `Message: "${text}"`,
            'Memory extraction. Output NONE or a brief fact.'
          );
          const fact = check.trim();
          if (fact && fact.toUpperCase() !== 'NONE' && !fact.toLowerCase().includes('none')) {
            await MemoryModel.create({ type: 'important', content: fact, timestamp: new Date() });
          }
        } catch (e) { }
      });

    } catch (error) {
      console.error('Telegram handleMessage error:', error);
      await this.safeSend(chatId, `⚠️ <b>Error:</b> ${this.escapeHtml(error.message)}`);
    }
  }
}

export default new TelegramIntegration();
