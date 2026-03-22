import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { Save, RefreshCw, Bot, Mail, MessageCircle, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const { authenticatedFetch } = useAuth();

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      if (!settings) return;
      try {
        const p = settings.ai_provider || 'openai';
        const res = await authenticatedFetch(`/api/ai/models?provider=${encodeURIComponent(p)}`);
        const data = await res.json();
        setAvailableModels(Array.isArray(data.models) ? data.models : []);

        if (!settings.ai_model && Array.isArray(data.models) && data.models[0]) {
          updateSetting('ai_model', data.models[0]);
        }
      } catch (e) {
        console.error('Failed to load models', e);
        setAvailableModels([]);
      }
    };

    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.ai_provider]);

  const fetchSettings = async () => {
    try {
      const response = await authenticatedFetch('/api/settings');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSettings(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setLoading(false);
    }
  };

  const connectGmail = async () => {
    try {
      const res = await authenticatedFetch('/api/auth/gmail/url');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        alert('Failed to get Gmail auth URL');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to start Gmail connect');
    }
  };

  const testAI = async () => {
    try {
      setTestingAI(true);
      const res = await authenticatedFetch('/api/ai/test', { method: 'POST' });
      const data = await res.json();
      alert(data.connected ? 'AI connected ✅' : 'AI connection failed ❌');
    } catch (e) {
      console.error(e);
      alert('AI connection test failed');
    } finally {
      setTestingAI(false);
    }
  };

  const sendDailySummaryNow = async () => {
    try {
      await authenticatedFetch('/api/daily-summary/send-now', { method: 'POST' });
      alert('Daily summary sent (if Telegram configured)');
    } catch (e) {
      console.error(e);
      alert('Failed to send daily summary');
    }
  };

  const testTelegram = async () => {
    try {
      setTestingTelegram(true);
      const res = await authenticatedFetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Telegram test failed');
        return;
      }
      alert(`Telegram OK ✅\nBot: @${data.bot?.username}\nChatId: ${data.chatId}`);
    } catch (e) {
      console.error(e);
      alert('Telegram test failed');
    } finally {
      setTestingTelegram(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const response = await authenticatedFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        alert('Settings saved successfully!');
        if (settings.ai_provider) {
           // Refetch to see masked effects
           fetchSettings();
        }
      }
      setSaving(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
      setSaving(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  const isTelegramConnected = settings?.telegram_bot_token && settings?.telegram_chat_id;
  const isGmailConnected = settings?.gmail_client_id && settings?.gmail_refresh_token;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground animate-pulse text-lg">Loading settings...</div>
      </div>
    );
  }

  const showModelDropdown = !['openrouter', 'groq', 'ollama'].includes(settings?.ai_provider);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure your AI email agent's integrations and behavior
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving} className="gap-2 shadow-lg hover:shadow-xl transition-all">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <Tabs defaultValue="telegram" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:flex bg-muted/50 p-1">
          <TabsTrigger value="telegram" className="gap-2 relative">
            <MessageCircle className="h-4 w-4" />
            Telegram
            {isTelegramConnected && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2 relative">
            <Mail className="h-4 w-4" />
            Email
            {isGmailConnected && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Bot className="h-4 w-4" />
            AI Provider
          </TabsTrigger>
          <TabsTrigger value="auto-reply" className="gap-2">
            <SettingsIcon className="h-4 w-4" />
            Auto-Reply
          </TabsTrigger>
        </TabsList>

        <TabsContent value="telegram">
          <Card className="border-t-4 border-t-primary shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xl">Telegram Configuration</CardTitle>
                <CardDescription>
                  Connect your Telegram bot to control the agent remotely
                </CardDescription>
              </div>
              {isTelegramConnected && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium border border-green-200">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Connected
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="telegram-bot-token" className="text-sm font-semibold">Bot Token</Label>
                <Input
                  id="telegram-bot-token"
                  type="password"
                  value={settings.telegram_bot_token || ''}
                  onChange={(e) => updateSetting('telegram_bot_token', e.target.value)}
                  placeholder="712345678:AAEb1234567890..."
                  className="bg-muted/30 focus-visible:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">@BotFather</a> on Telegram
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="telegram-chat-id" className="text-sm font-semibold">Chat ID</Label>
                <Input
                  id="telegram-chat-id"
                  value={settings.telegram_chat_id || ''}
                  onChange={(e) => updateSetting('telegram_chat_id', e.target.value)}
                  placeholder="Paste your Chat ID here"
                  className="bg-muted/30 border-green-200 focus-visible:ring-green-400"
                />
                <p className="text-[11px] text-muted-foreground bg-green-50 p-2 rounded border border-green-100 italic">
                  Tip: Chat ID auto-save ho jata hai. Bot ko Telegram me <b>/start</b> bhejo, phir yahan refresh karo.
                </p>
              </div>

              <div className="pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={testTelegram} 
                  disabled={testingTelegram}
                  className="w-full md:w-auto gap-2"
                >
                  {testingTelegram ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                  {testingTelegram ? 'Testing...' : 'Test Telegram Bot'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <div className="space-y-4">
            <Card className="border-t-4 border-t-red-500 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-xl">Gmail Integration</CardTitle>
                  <CardDescription>
                    Connect your Gmail account via OAuth 2.0
                  </CardDescription>
                </div>
                {isGmailConnected && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium border border-green-200">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Connected
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="gmail-client-id" className="text-sm font-semibold">Client ID</Label>
                    <Input
                      id="gmail-client-id"
                      value={settings.gmail_client_id || ''}
                      onChange={(e) => updateSetting('gmail_client_id', e.target.value)}
                      placeholder="Enter Gmail OAuth Client ID"
                      className="bg-muted/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gmail-client-secret" className="text-sm font-semibold">Client Secret</Label>
                    <Input
                      id="gmail-client-secret"
                      type="password"
                      value={settings.gmail_client_secret || ''}
                      onChange={(e) => updateSetting('gmail_client_secret', e.target.value)}
                      placeholder="Enter Gmail OAuth Client Secret"
                      className="bg-muted/30"
                    />
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={connectGmail}
                    className="w-full md:w-auto gap-2 border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700"
                  >
                    <Mail className="h-4 w-4" />
                    Connect Gmail (OAuth Login)
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    After login, a new tab will say "Gmail connected". Then return here.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-dashed">
              <CardHeader>
                <CardTitle className="text-lg">Other Integrations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6">
                   {/* Outlook simplified */}
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
                    <h3 className="font-semibold flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      Outlook Configuration
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="outlook-client-id">Client ID</Label>
                        <Input
                          id="outlook-client-id"
                          value={settings.outlook_client_id || ''}
                          onChange={(e) => updateSetting('outlook_client_id', e.target.value)}
                          placeholder="Azure App Client ID"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="outlook-client-secret">Client Secret</Label>
                        <Input
                          id="outlook-client-secret"
                          type="password"
                          value={settings.outlook_client_secret || ''}
                          onChange={(e) => updateSetting('outlook_client_secret', e.target.value)}
                          placeholder="Azure App Secret"
                          className="text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
                    <h3 className="font-semibold flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-slate-500" />
                      Custom Domain (IMAP/SMTP)
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="custom-imap-host">IMAP Host</Label>
                        <Input
                          id="custom-imap-host"
                          value={settings.custom_imap_host || ''}
                          onChange={(e) => updateSetting('custom_imap_host', e.target.value)}
                          placeholder="imap.example.com"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custom-imap-port">IMAP Port</Label>
                        <Input
                          id="custom-imap-port"
                          type="number"
                          value={settings.custom_imap_port || 993}
                          onChange={(e) => updateSetting('custom_imap_port', parseInt(e.target.value))}
                          placeholder="993"
                          className="text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Input
                        id="custom-email"
                        type="email"
                        value={settings.custom_email || ''}
                        onChange={(e) => updateSetting('custom_email', e.target.value)}
                        placeholder="Email (e.g., info@domain.com)"
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <Card className="border-t-4 border-t-purple-500 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xl">AI Brain Settings</CardTitle>
                <CardDescription>
                  Configure the brain that will analyze and reply to your emails
                </CardDescription>
              </div>
              <Bot className="h-8 w-8 text-purple-500 opacity-20" />
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ai-provider" className="text-sm font-semibold">Select Provider</Label>
                  <select
                    id="ai-provider"
                    value={settings.ai_provider || 'openai'}
                    onChange={(e) => updateSetting('ai_provider', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="openai">OpenAI (GPT Models)</option>
                    <option value="groq">Groq (Ultra-Fast Llama/Mixtral)</option>
                    <option value="gemini">Google Gemini (Flash/Pro)</option>
                    <option value="anthropic">Anthropic Claude 3.5</option>
                    <option value="openrouter">OpenRouter (300+ Models)</option>
                    <option value="ollama">Ollama (Local Models)</option>
                    <option value="custom">Custom Endpoint (OpenAI-Compatible)</option>
                  </select>
                </div>
                {settings.ai_provider !== 'ollama' && (
                  <div className="space-y-2">
                    <Label htmlFor="ai-api-key" className="text-sm font-semibold">API Key</Label>
                    <Input
                      id="ai-api-key"
                      type="password"
                      value={settings.ai_api_key || ''}
                      onChange={(e) => updateSetting('ai_api_key', e.target.value)}
                      placeholder="Enter Provider API Key"
                      className="bg-muted/30"
                    />
                  </div>
                )}
              </div>

              {settings.ai_provider === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="custom-ai-endpoint" className="text-sm font-semibold">Base URL (Custom Endpoint)</Label>
                  <Input
                    id="custom-ai-endpoint"
                    value={settings.custom_ai_endpoint || ''}
                    onChange={(e) => updateSetting('custom_ai_endpoint', e.target.value)}
                    placeholder="e.g., https://api.together.xyz/v1"
                    className="bg-muted/30"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ai-model" className="text-sm font-semibold">
                  AI Model Name {(!showModelDropdown) && <span className="text-xs font-normal text-muted-foreground">(Manual Entry)</span>}
                </Label>
                
                {showModelDropdown ? (
                  <select
                    id="ai-model"
                    value={settings.ai_model || ''}
                    onChange={(e) => updateSetting('ai_model', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    {availableModels.length === 0 && (
                      <option value="">Loading models...</option>
                    )}
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="ai-model"
                    value={settings.ai_model || ''}
                    onChange={(e) => updateSetting('ai_model', e.target.value)}
                    placeholder={settings.ai_provider === 'groq' ? "e.g., llama-3.3-70b-versatile" : "e.g., openai/gpt-5.4-max"}
                    className="bg-muted/30 border-blue-200"
                  />
                )}
                
                <p className="text-[11px] text-muted-foreground mt-2 px-1">
                  <b>Recommended:</b> OpenAI (gpt-5.4), Groq (llama-3.3-70b-versatile), Gemini (gemini-3.1-pro), Anthropic (claude-4.6-sonnet)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system-instructions" className="text-sm font-semibold">Agent Personality / Instructions</Label>
                <textarea
                  id="system-instructions"
                  value={settings.system_instructions || ''}
                  onChange={(e) => updateSetting('system_instructions', e.target.value)}
                  placeholder="You are a polite executive assistant. Keep summaries short..."
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  rows={4}
                />
              </div>

              <div className="pt-2 flex gap-3">
                <Button variant="outline" className="gap-2" onClick={testAI} disabled={testingAI}>
                  {testingAI ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {testingAI ? 'Testing...' : 'Test AI Connection'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auto-reply">
          <Card className="border-t-4 border-t-orange-500 shadow-md">
            <CardHeader>
              <CardTitle className="text-xl inline-flex items-center gap-2">
                <SettingsIcon className="h-5 w-5 text-orange-500" />
                Automation & Behavior
              </CardTitle>
              <CardDescription>
                Configure how the agent reacts to new emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="grid gap-6">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/5">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Enable Master Auto-Reply</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Enable/Disable all automated responses
                    </p>
                  </div>
                  <Switch
                    checked={!!settings.auto_reply_enabled}
                    onCheckedChange={(checked) => updateSetting('auto_reply_enabled', checked ? 1 : 0)}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/5">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Human Proofreading (Recommended)</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Require Telegram approval before any reply is sent
                    </p>
                  </div>
                  <Switch
                    checked={!!settings.human_in_loop}
                    onCheckedChange={(checked) => updateSetting('human_in_loop', checked ? 1 : 0)}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="auto-reply-tags" className="text-sm font-semibold text-orange-700">Keyword Tags (Triggers)</Label>
                    <Input
                      id="auto-reply-tags"
                      value={settings.auto_reply_tags || ''}
                      onChange={(e) => updateSetting('auto_reply_tags', e.target.value)}
                      placeholder="e.g., support, urgent, price, help"
                      className="bg-orange-50/30 border-orange-200"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Comma separated words that trigger AI reply
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email-check-interval" className="text-sm font-semibold">Monitor Interval (min)</Label>
                    <Input
                      id="email-check-interval"
                      type="number"
                      value={settings.email_check_interval || 5}
                      onChange={(e) => updateSetting('email_check_interval', parseInt(e.target.value))}
                      className="bg-muted/30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto-reply-template" className="text-sm font-semibold">Custom Reply Context/Template</Label>
                  <textarea
                    id="auto-reply-template"
                    value={settings.auto_reply_template || ''}
                    onChange={(e) => updateSetting('auto_reply_template', e.target.value)}
                    placeholder="Provide details about your business or specific instructions for AI replies..."
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-400"
                    rows={4}
                  />
                </div>

                <div className="pt-4 border-t space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-bold">Daily Briefing (Telegram)</Label>
                      <p className="text-[11px] text-muted-foreground">Get a summary of all missed emails at a specific time</p>
                    </div>
                    <Switch
                      checked={!!settings.daily_summary_enabled}
                      onCheckedChange={(checked) => updateSetting('daily_summary_enabled', checked ? 1 : 0)}
                    />
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Input
                      id="daily-summary-time"
                      type="time"
                      value={settings.daily_summary_time || '09:00'}
                      onChange={(e) => updateSetting('daily_summary_time', e.target.value)}
                      className="max-w-[120px]"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={sendDailySummaryNow}>
                      Test Briefing Now
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

