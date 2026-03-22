import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { SettingsModel } from '../database/models.js';

class OutlookIntegration {
  constructor() {
    this.client = null;
  }

  async getClient() {
    const settings = await SettingsModel.get();
    
    if (!settings.outlook_client_id || !settings.outlook_client_secret) {
      throw new Error('Outlook credentials not configured');
    }

    const credential = new ClientSecretCredential(
      process.env.OUTLOOK_TENANT_ID || 'common',
      settings.outlook_client_id,
      settings.outlook_client_secret
    );

    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken('https://graph.microsoft.com/.default');
          return token.token;
        }
      }
    });

    return this.client;
  }

  async fetchEmails(maxResults = 20) {
    try {
      const client = await this.getClient();
      const res = await client.api('/me/messages')
        .filter("isRead eq false")
        .top(maxResults)
        .orderby('receivedDateTime desc')
        .get();

      return res.value.map(msg => ({
        source: 'outlook',
        message_id: msg.id,
        from_email: msg.from?.emailAddress?.address || '',
        to_emails: msg.toRecipients?.map(r => r.emailAddress?.address) || [],
        subject: msg.subject || '',
        body: msg.body?.content || '',
        timestamp: new Date(msg.receivedDateTime),
        read: msg.isRead || false,
        starred: msg.flag?.flagStatus === 'flagged' || false,
        labels: []
      }));
    } catch (error) {
      console.error('Outlook fetch error:', error.message);
      throw error;
    }
  }

  async sendEmail(to, subject, body) {
    try {
      const client = await this.getClient();
      
      const message = {
        message: {
          subject: subject,
          body: {
            contentType: 'Text',
            content: body
          },
          toRecipients: [{
            emailAddress: {
              address: to
            }
          }]
        },
        saveToSentItems: true
      };

      const res = await client.api('/me/sendMail').post(message);
      return res;
    } catch (error) {
      console.error('Outlook send error:', error.message);
      throw error;
    }
  }

  async deleteEmail(messageId) {
    try {
      const client = await this.getClient();
      await client.api(`/me/messages/${messageId}`).delete();
      return true;
    } catch (error) {
      console.error('Outlook delete error:', error.message);
      throw error;
    }
  }

  async starEmail(messageId) {
    try {
      const client = await this.getClient();
      await client.api(`/me/messages/${messageId}`).patch({
        flag: {
          flagStatus: 'flagged'
        }
      });
      return true;
    } catch (error) {
      console.error('Outlook star error:', error.message);
      throw error;
    }
  }

  async unstarEmail(messageId) {
    try {
      const client = await this.getClient();
      await client.api(`/me/messages/${messageId}`).patch({
        flag: {
          flagStatus: 'notFlagged'
        }
      });
      return true;
    } catch (error) {
      console.error('Outlook unstar error:', error.message);
      throw error;
    }
  }

  async markAsRead(messageId) {
    try {
      const client = await this.getClient();
      await client.api(`/me/messages/${messageId}`).patch({
        isRead: true
      });
      return true;
    } catch (error) {
      console.error('Outlook mark read error:', error.message);
      throw error;
    }
  }
}

export default new OutlookIntegration();
