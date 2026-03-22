import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.js';
import TelegramIntegration from './integrations/telegram.js';
import { startEmailMonitoring } from './scheduler/emailMonitor.js';
import { startDailySummaryScheduler } from './scheduler/dailySummary.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for ease of use locally


app.get('/auth/gmail/callback', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(`/api/auth/gmail/callback${qs ? `?${qs}` : ''}`);
});

app.get('/auth/gmail/url', (req, res) => {
  res.redirect('/api/auth/gmail/url');
});

app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, async () => {
  console.log(`🚀 AI Email Agent server running on port ${PORT}`);
  
  try {
    await TelegramIntegration.init();
    console.log('✅ Telegram bot initialized');
    
    await startEmailMonitoring();
    console.log('✅ Email monitoring started');

    await startDailySummaryScheduler();
  } catch (error) {
    console.error('❌ Initialization error:', error);
  }
});
