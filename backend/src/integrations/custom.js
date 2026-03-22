import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { SettingsModel } from '../database/models.js';

class CustomDomainIntegration {
  constructor() {
    this.imapClient = null;
    this.smtpTransporter = null;
  }

  async getSettings() {
    return await SettingsModel.get();
  }

  async connectIMAP() {
    const settings = await this.getSettings();
    
    if (!settings.custom_imap_host || !settings.custom_email || !settings.custom_password) {
      throw new Error('Custom domain credentials not configured');
    }

    this.imapClient = new ImapFlow({
      host: settings.custom_imap_host,
      port: settings.custom_imap_port || 993,
      secure: true,
      auth: {
        user: settings.custom_email,
        pass: settings.custom_password
      },
      logger: false
    });

    await this.imapClient.connect();
    return this.imapClient;
  }

  async getSMTPTransporter() {
    const settings = await this.getSettings();
    
    if (!settings.custom_smtp_host || !settings.custom_email || !settings.custom_password) {
      throw new Error('Custom domain SMTP credentials not configured');
    }

    if (!this.smtpTransporter) {
      this.smtpTransporter = nodemailer.createTransport({
        host: settings.custom_smtp_host,
        port: settings.custom_smtp_port || 587,
        secure: false,
        auth: {
          user: settings.custom_email,
          pass: settings.custom_password
        }
      });
    }

    return this.smtpTransporter;
  }

  async fetchEmails(maxResults = 20) {
    try {
      const client = await this.connectIMAP();
      
      await client.mailboxOpen('INBOX');
      
      const messages = [];
      for await (const msg of client.fetch('1:*', { 
        envelope: true, 
        source: true,
        flags: true,
        internalDate: true
      })) {
        if (messages.length >= maxResults) break;
        
        const headers = msg.source.toString().split('\r\n\r\n')[0];
        const body = msg.source.toString().split('\r\n\r\n').slice(1).join('\r\n\r\n');
        
        const fromEmail = msg.envelope.from?.[0]?.address || '';
        const toEmails = msg.envelope.to?.map(t => t.address) || [];
        const subject = msg.envelope.subject || '';
        
        messages.push({
          source: 'custom',
          message_id: msg.uid.toString(),
          from_email: fromEmail,
          to_emails: toEmails,
          subject: subject,
          body: body,
          timestamp: msg.internalDate,
          read: !msg.flags?.includes('\\Seen'),
          starred: msg.flags?.includes('\\Flagged') || false,
          labels: []
        });
      }

      await client.logout();
      return messages;
    } catch (error) {
      console.error('Custom domain fetch error:', error.message);
      throw error;
    }
  }

  async sendEmail(to, subject, body) {
    try {
      const transporter = await this.getSMTPTransporter();
      const settings = await this.getSettings();
      
      const info = await transporter.sendMail({
        from: settings.custom_email,
        to: to,
        subject: subject,
        text: body
      });

      return info;
    } catch (error) {
      console.error('Custom domain send error:', error.message);
      throw error;
    }
  }

  async deleteEmail(messageId) {
    try {
      const client = await this.connectIMAP();
      await client.mailboxOpen('INBOX');
      
      await client.messageDelete(messageId);
      await client.logout();
      return true;
    } catch (error) {
      console.error('Custom domain delete error:', error.message);
      throw error;
    }
  }

  async starEmail(messageId) {
    try {
      const client = await this.connectIMAP();
      await client.mailboxOpen('INBOX');
      
      await client.messageFlagsAdd(messageId, ['\\Flagged']);
      await client.logout();
      return true;
    } catch (error) {
      console.error('Custom domain star error:', error.message);
      throw error;
    }
  }

  async unstarEmail(messageId) {
    try {
      const client = await this.connectIMAP();
      await client.mailboxOpen('INBOX');
      
      await client.messageFlagsRemove(messageId, ['\\Flagged']);
      await client.logout();
      return true;
    } catch (error) {
      console.error('Custom domain unstar error:', error.message);
      throw error;
    }
  }

  async markAsRead(messageId) {
    try {
      const client = await this.connectIMAP();
      await client.mailboxOpen('INBOX');
      
      await client.messageFlagsAdd(messageId, ['\\Seen']);
      await client.logout();
      return true;
    } catch (error) {
      console.error('Custom domain mark read error:', error.message);
      throw error;
    }
  }
}

export default new CustomDomainIntegration();
