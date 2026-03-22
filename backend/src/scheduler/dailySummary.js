import cron from 'node-cron';
import { SettingsModel, EmailModel } from '../database/models.js';
import TelegramIntegration from '../integrations/telegram.js';

let dailyJob = null;

function parseTimeHHMM(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

async function sendDailySummaryOnce() {
  const settings = await SettingsModel.get();
  if (!settings.daily_summary_enabled) return;

  const emails = await EmailModel.getAll(20, 0);
  const top = emails.slice(0, 10);

  if (top.length === 0) {
    await TelegramIntegration.bot?.sendMessage(settings.telegram_chat_id, '📭 Daily Summary: No emails found.');
    return;
  }

  let message = '📌 *Daily Email Summary*\n\n';
  top.forEach((email, idx) => {
    message += `*${idx + 1}.* ${email.subject || '(No subject)'}\n`;
    message += `From: ${email.from_email}\n`;
    message += `Summary: ${email.summary || 'No summary'}\n\n`;
  });

  try {
    await TelegramIntegration.bot?.sendMessage(settings.telegram_chat_id, message, { parse_mode: 'Markdown' });
  } catch (e) {
    // Fallback to plain text if Markdown fails
    await TelegramIntegration.bot?.sendMessage(settings.telegram_chat_id, message.replace(/[*_`\[\]]/g, ''));
  }
}

export async function startDailySummaryScheduler() {
  const settings = await SettingsModel.get();
  if (!settings.daily_summary_enabled) {
    if (dailyJob) {
      dailyJob.stop();
      dailyJob = null;
    }
    return;
  }

  const t = parseTimeHHMM(settings.daily_summary_time);
  if (!t) {
    console.error('Invalid daily_summary_time. Use HH:MM');
    return;
  }

  if (dailyJob) {
    dailyJob.stop();
  }

  dailyJob = cron.schedule(`${t.minute} ${t.hour} * * *`, async () => {
    try {
      await sendDailySummaryOnce();
    } catch (e) {
      console.error('Daily summary error:', e);
    }
  });

  console.log(`🗓️ Daily summary scheduled at ${settings.daily_summary_time}`);
}

export async function triggerDailySummaryNow() {
  await sendDailySummaryOnce();
}
