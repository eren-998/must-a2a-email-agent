import cron from 'node-cron';
import { SettingsModel, EmailModel, StatsModel, PendingActionModel } from '../database/models.js';
import GmailIntegration from '../integrations/gmail.js';
import OutlookIntegration from '../integrations/outlook.js';
import CustomDomainIntegration from '../integrations/custom.js';
import AIProvider from '../ai/providers.js';
import TelegramIntegration from '../integrations/telegram.js';

let monitoringJob = null;

async function fetchAndProcessEmails() {
  try {
    console.log('📧 Fetching emails...');
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

    let newEmailsCount = 0;
    for (const email of allEmails) {
      const existing = await EmailModel.getByMessageId(email.message_id);
      if (!existing) {
        const summary = await AIProvider.generateSummary(email.body, settings.system_instructions);
        email.summary = summary;
        const id = await EmailModel.create(email);
        email.id = id;
        
        await StatsModel.increment('emails_processed');
        await StatsModel.increment('emails_summarized');
        
        // Only notify via Telegram if daily summary / notifications are enabled
        if (settings.daily_summary_enabled) {
          await TelegramIntegration.notifyNewEmail(email);
        }
        
        if (settings.auto_reply_enabled) {
          await checkAndCreateAutoReply(email, settings);
        }
        
        newEmailsCount++;
      }
    }

    await StatsModel.updateLastCheck();
    console.log(`✅ Processed ${newEmailsCount} new emails`);
  } catch (error) {
    console.error('Email monitoring error:', error);
    await TelegramIntegration.notifyError(error);
  }
}

async function checkAndCreateAutoReply(email, settings) {
  try {
    const autoReplyTags = settings.auto_reply_tags ? settings.auto_reply_tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
    
    if (autoReplyTags.length === 0) return;

    const shouldAutoReply = autoReplyTags.some(tag => {
      return (email.subject || '').toLowerCase().includes(tag) || 
             (email.body || '').toLowerCase().includes(tag) ||
             (email.from_email || '').toLowerCase().includes(tag);
    });

    if (!shouldAutoReply) {
      return;
    }

    // Build a rich context for the AI to generate a smart, contextual reply
    const emailContext = [
      `From: ${email.from_email}`,
      `Subject: ${email.subject}`,
      `Body:\n${email.body}`
    ].join('\n');

    const replyInstructions = [
      'You are a professional email assistant.',
      'Read the email below and write a concise, polite, and relevant reply.',
      'The reply should directly address the content of the email — do NOT write a generic response.',
      'Keep the tone professional but friendly.',
      'Sign off with the user\'s name if you know it, otherwise just "Best regards".',
      settings.system_instructions || '',
    ].join('\n');

    const reply = await AIProvider.generateReply(
      emailContext,
      replyInstructions,
      settings.auto_reply_template
    );

    if (settings.human_in_loop) {
      const actionId = await PendingActionModel.create({
        type: 'autoReply',
        email_id: email.id,
        reply_content: reply,
        status: 'pending',
        timestamp: new Date()
      });

      await TelegramIntegration.notifyAutoReplyPending(
        { id: actionId, reply_content: reply },
        email
      );
    } else {
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
      }

      await StatsModel.increment('auto_replies_sent');
      console.log(`🤖 Auto-reply sent to ${email.from_email}`);
    }
  } catch (error) {
    console.error('Auto-reply error:', error);
  }
}

export async function startEmailMonitoring() {
  try {
    const settings = await SettingsModel.get();
    const interval = settings.email_check_interval || 5;
    
    if (monitoringJob) {
      monitoringJob.stop();
    }

    monitoringJob = cron.schedule(`*/${interval} * * * *`, fetchAndProcessEmails, {
      scheduled: true
    });

    console.log(`🔄 Email monitoring started (checking every ${interval} minutes)`);
    console.log('📋 Next email check will run at the scheduled interval (not immediately on startup)');
  } catch (error) {
    console.error('Failed to start email monitoring:', error);
  }
}

export async function stopEmailMonitoring() {
  if (monitoringJob) {
    monitoringJob.stop();
    monitoringJob = null;
    console.log('⏹️ Email monitoring stopped');
  }
}

export async function restartEmailMonitoring() {
  await stopEmailMonitoring();
  await startEmailMonitoring();
}

export function isMonitoringActive() {
  return monitoringJob !== null;
}

export async function triggerEmailFetchNow() {
  await fetchAndProcessEmails();
}
