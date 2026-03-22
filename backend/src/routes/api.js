import express from 'express';
import { SettingsModel, EmailModel, StatsModel, MemoryModel, PendingActionModel } from '../database/models.js';
import GmailIntegration from '../integrations/gmail.js';
import OutlookIntegration from '../integrations/outlook.js';
import CustomDomainIntegration from '../integrations/custom.js';
import AIProvider from '../ai/providers.js';
import TelegramIntegration from '../integrations/telegram.js';
import { startDailySummaryScheduler, triggerDailySummaryNow } from '../scheduler/dailySummary.js';

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    const settings = await SettingsModel.get();
    // Security: Mask sensitive fields so they aren't fully exposed to frontend
    const masked = { ...settings };
    const secretFields = [
      'ai_api_key', 'gmail_client_secret', 'outlook_client_secret', 
      'gmail_refresh_token', 'outlook_refresh_token', 'custom_password', 
      'telegram_bot_token'
    ];
    secretFields.forEach(f => {
      if (typeof masked[f] === 'string' && masked[f].length > 0) {
        masked[f] = masked[f].substring(0, 4) + '********';
      }
    });
    res.json(masked);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    await SettingsModel.update(req.body);
    const settings = await SettingsModel.get();
    await startDailySummaryScheduler();
    await TelegramIntegration.init();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await StatsModel.get();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/emails', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const emails = await EmailModel.getAll(limit, offset);
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/emails/:id', async (req, res) => {
  try {
    const email = await EmailModel.getById(req.params.id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    res.json(email);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/emails/:id/read', async (req, res) => {
  try {
    await EmailModel.markAsRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/emails/:id/star', async (req, res) => {
  try {
    await EmailModel.toggleStar(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/emails/:id', async (req, res) => {
  try {
    await EmailModel.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/emails/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    const settings = await SettingsModel.get();
    let result;

    if (settings.gmail_client_id && settings.gmail_refresh_token) {
      result = await GmailIntegration.sendEmail(to, subject, body);
    } else if (settings.outlook_client_id && settings.outlook_refresh_token) {
      result = await OutlookIntegration.sendEmail(to, subject, body);
    } else if (settings.custom_email && settings.custom_password) {
      result = await CustomDomainIntegration.sendEmail(to, subject, body);
    } else {
      return res.status(400).json({ error: 'No email integration configured' });
    }

    await StatsModel.increment('emails_sent');
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/emails/reply', async (req, res) => {
  try {
    const { emailId, reply } = req.body;
    const email = await EmailModel.getById(emailId);
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    let result;
    switch (email.source) {
      case 'gmail':
        result = await GmailIntegration.sendEmail(email.from_email, `Re: ${email.subject}`, reply);
        break;
      case 'outlook':
        result = await OutlookIntegration.sendEmail(email.from_email, `Re: ${email.subject}`, reply);
        break;
      case 'custom':
        result = await CustomDomainIntegration.sendEmail(email.from_email, `Re: ${email.subject}`, reply);
        break;
      default:
        return res.status(400).json({ error: 'Unknown email source' });
    }

    await StatsModel.increment('emails_sent');
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/emails/fetch', async (req, res) => {
  try {
    const settings = await SettingsModel.get();
    const allEmails = [];

    if (settings.gmail_client_id && settings.gmail_refresh_token) {
      try {
        const gmailEmails = await GmailIntegration.fetchEmails(20);
        allEmails.push(...gmailEmails);
      } catch (error) {
        console.error('Gmail fetch error:', error.message);
      }
    }

    if (settings.outlook_client_id && settings.outlook_refresh_token) {
      try {
        const outlookEmails = await OutlookIntegration.fetchEmails(20);
        allEmails.push(...outlookEmails);
      } catch (error) {
        console.error('Outlook fetch error:', error.message);
      }
    }

    if (settings.custom_email && settings.custom_password) {
      try {
        const customEmails = await CustomDomainIntegration.fetchEmails(20);
        allEmails.push(...customEmails);
      } catch (error) {
        console.error('Custom domain fetch error:', error.message);
      }
    }

    for (const email of allEmails) {
      const existing = await EmailModel.getByMessageId(email.message_id);
      if (!existing) {
        const settings = await SettingsModel.get();
        const summary = await AIProvider.generateSummary(email.body, settings.system_instructions);
        email.summary = summary;
        const id = await EmailModel.create(email);
        email.id = id;
        
        await StatsModel.increment('emails_processed');
        await StatsModel.increment('emails_summarized');
        await TelegramIntegration.notifyNewEmail(email);
      }
    }

    await StatsModel.updateLastCheck();
    res.json({ success: true, count: allEmails.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/memory', async (req, res) => {
  try {
    const type = req.query.type;
    const limit = parseInt(req.query.limit) || 100;
    const memory = await MemoryModel.getAll(type, limit);
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/memory', async (req, res) => {
  try {
    const { type, content, relatedEmailId } = req.body;
    const id = await MemoryModel.create({ type, content, relatedEmailId });
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/memory/search', async (req, res) => {
  try {
    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 20;
    const results = await MemoryModel.search(query, limit);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/memory/:id', async (req, res) => {
  try {
    const { content } = req.body;
    await MemoryModel.update(req.params.id, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/memory/:id', async (req, res) => {
  try {
    await MemoryModel.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pending-actions', async (req, res) => {
  try {
    const status = req.query.status;
    const actions = await PendingActionModel.getAll(status);
    res.json(actions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/pending-actions/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await PendingActionModel.updateStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/pending-actions/:id', async (req, res) => {
  try {
    await PendingActionModel.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/clear', async (req, res) => {
  try {
    await MemoryModel.clearAll();
    res.json({ message: 'Memory cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/test', async (req, res) => {
  try {
    const connected = await AIProvider.testConnection();
    res.json({ connected });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/summarize', async (req, res) => {
  try {
    const { content } = req.body;
    const settings = await SettingsModel.get();
    const summary = await AIProvider.generateSummary(content, settings.system_instructions);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/reply', async (req, res) => {
  try {
    const { content, template } = req.body;
    const settings = await SettingsModel.get();
    const reply = await AIProvider.generateReply(content, settings.system_instructions, template);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth/gmail/url', async (req, res) => {
  try {
    const url = await GmailIntegration.getAuthUrl();
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth/gmail/callback', async (req, res) => {
  try {
    const { code } = req.query;
    await GmailIntegration.setTokens(code);
    res.send('Gmail connected. You can close this tab and return to the app.');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/daily-summary/send-now', async (req, res) => {
  try {
    await triggerDailySummaryNow();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/telegram/status', async (req, res) => {
  try {
    const settings = await SettingsModel.get();
    const hasToken = !!settings.telegram_bot_token;
    const hasChatId = !!settings.telegram_chat_id;
    res.json({
      hasToken,
      hasChatId,
      chatId: settings.telegram_chat_id || null,
      botRunning: !!TelegramIntegration.bot
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/telegram/test', async (req, res) => {
  try {
    await TelegramIntegration.init();
    const settings = await SettingsModel.get();

    if (!TelegramIntegration.bot) {
      return res.status(400).json({ error: 'Telegram bot not initialized. Check bot token.' });
    }

    const me = await TelegramIntegration.bot.getMe();
    const chatId = settings.telegram_chat_id;
    if (!chatId) {
      return res.status(400).json({
        error: 'telegram_chat_id not set. Open Telegram and send /start to your bot, then refresh settings.'
      });
    }

    await TelegramIntegration.bot.sendMessage(chatId, '✅ Test message from AI Email Agent backend');
    res.json({ success: true, bot: me, chatId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ai/models', async (req, res) => {
  try {
    const { provider } = req.query;
    const p = (provider || 'openai').toString();

    const curated = {
      openai: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-instant', 'o3-mini', 'gpt-4o', 'gpt-4o-mini'],
      groq: ['llama-3.3-70b-versatile', 'llama-3.3-70b-specdec', 'llama-3-groq-70b-tool-use', 'llama3-70b-8192', 'mixtral-8x7b-32768'], 
      gemini: ['gemini-3.1-pro', 'gemini-3.1-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'],
      anthropic: ['claude-4.6-opus', 'claude-4.6-sonnet', 'claude-4.5-haiku'],
      openrouter: [], // Manual entry handled in UI
      ollama: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'phi3']
    };

    if (p === 'ollama') {
      try {
        const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const r = await fetch(`${baseUrl}/api/tags`);
        if (r.ok) {
          const data = await r.json();
          const models = (data.models || []).map(m => m.name).filter(Boolean);
          if (models.length) return res.json({ provider: p, models });
        }
      } catch (_) {
        // fallback to curated
      }
    }

    res.json({ provider: p, models: curated[p] || curated.openai });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
