import { google } from 'googleapis';
import { SettingsModel } from '../database/models.js';

class GmailIntegration {
  constructor() {
    this.oauth2Client = null;
  }

  async getOAuth2Client() {
    const settings = await SettingsModel.get();
    
    if (!settings.gmail_client_id || !settings.gmail_client_secret) {
      throw new Error('Gmail credentials not configured');
    }

    this.oauth2Client = new google.auth.OAuth2(
      settings.gmail_client_id,
      settings.gmail_client_secret,
      process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/auth/gmail/callback'
    );

    if (settings.gmail_refresh_token) {
      this.oauth2Client.setCredentials({
        refresh_token: settings.gmail_refresh_token
      });
    }

    return this.oauth2Client;
  }

  async getAuthUrl() {
    const client = await this.getOAuth2Client();
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify'
      ]
    });
    return authUrl;
  }

  async setTokens(code) {
    const client = await this.getOAuth2Client();
    const { tokens } = await client.getToken(code);
    
    if (tokens.refresh_token) {
      await SettingsModel.update({
        gmail_refresh_token: tokens.refresh_token
      });
    }
    
    return tokens;
  }

  async getGmail() {
    const client = await this.getOAuth2Client();
    return google.gmail({ version: 'v1', auth: client });
  }

  async fetchEmails(maxResults = 20) {
    try {
      const gmail = await this.getGmail();
      const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'is:inbox'
      });

      if (!res.data.messages) return [];

      const emails = [];
      for (const message of res.data.messages) {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const headers = msg.data.payload.headers;
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name)?.value || '';

        const fromEmail = getHeader('From');
        const toEmails = getHeader('To').split(',').map(e => e.trim());
        const subject = getHeader('Subject');
        
        let body = '';
        if (msg.data.payload.body?.data) {
          body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
        } else if (msg.data.payload.parts) {
          for (const part of msg.data.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString('utf-8');
              break;
            }
          }
        }

        emails.push({
          source: 'gmail',
          message_id: message.id,
          from_email: fromEmail,
          to_emails: toEmails,
          subject: subject,
          body: body,
          timestamp: new Date(parseInt(msg.data.internalDate)),
          read: !msg.data.labelIds?.includes('UNREAD'),
          starred: msg.data.labelIds?.includes('STARRED') || false,
          labels: msg.data.labelIds || []
        });
      }

      return emails;
    } catch (error) {
      console.error('Gmail fetch error:', error.message);
      throw error;
    }
  }

  async sendEmail(to, subject, body, threadId = null) {
    try {
      const gmail = await this.getGmail();
      
      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ].join('\r\n');

      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw: encodedEmail,
          threadId: threadId
        }
      });

      return res.data;
    } catch (error) {
      console.error('Gmail send error:', error.message);
      throw error;
    }
  }

  async deleteEmail(messageId) {
    try {
      const gmail = await this.getGmail();
      await gmail.users.messages.trash({
        userId: 'me',
        id: messageId
      });
      return true;
    } catch (error) {
      console.error('Gmail delete error:', error.message);
      throw error;
    }
  }

  async starEmail(messageId) {
    try {
      const gmail = await this.getGmail();
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        resource: {
          addLabelIds: ['STARRED']
        }
      });
      return true;
    } catch (error) {
      console.error('Gmail star error:', error.message);
      throw error;
    }
  }

  async unstarEmail(messageId) {
    try {
      const gmail = await this.getGmail();
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        resource: {
          removeLabelIds: ['STARRED']
        }
      });
      return true;
    } catch (error) {
      console.error('Gmail unstar error:', error.message);
      throw error;
    }
  }

  async markAsRead(messageId) {
    try {
      const gmail = await this.getGmail();
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        resource: {
          removeLabelIds: ['UNREAD']
        }
      });
      return true;
    } catch (error) {
      console.error('Gmail mark read error:', error.message);
      throw error;
    }
  }
}

export default new GmailIntegration();
