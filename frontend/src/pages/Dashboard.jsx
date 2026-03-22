import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Mail, Send, MessageSquare, CheckCircle, Clock, Star, TrendingUp, ShieldCheck, Settings } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { authenticatedFetch } = useAuth();

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await authenticatedFetch('/api/stats');
      if (!response.ok) {
        if (response.status === 401) throw new Error('Unauthorized: Check your API Key');
        throw new Error(`Backend responded ${response.status}`);
      }
      const data = await response.json();
      setStats(data);
      setError('');
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setError(error.message || 'Backend not reachable');
      setLoading(false);
    }
  };

  const fetchEmails = async () => {
    try {
      const response = await authenticatedFetch('/api/emails/fetch', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        fetchStats();
      }
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor your AI email agent activity</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Backend Connection</CardTitle>
            <CardDescription>Frontend is running, but backend API is not available.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-destructive">{error || 'Backend unavailable'}</div>
            <div className="text-sm text-muted-foreground">
              Start backend: <code className="bg-muted px-2 py-1 rounded">npm start --prefix backend</code>
            </div>
            <Button onClick={fetchStats} variant="outline">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Emails Processed',
      value: stats.emails_processed,
      icon: Mail,
      description: 'Total emails received',
      color: 'text-blue-600'
    },
    {
      title: 'Emails Sent',
      value: stats.emails_sent,
      icon: Send,
      description: 'Replies and new emails',
      color: 'text-green-600'
    },
    {
      title: 'Summaries Created',
      value: stats.emails_summarized,
      icon: MessageSquare,
      description: 'AI-generated summaries',
      color: 'text-purple-600'
    },
    {
      title: 'Auto-Replies Sent',
      value: stats.auto_replies_sent,
      icon: CheckCircle,
      description: 'Automated responses',
      color: 'text-emerald-600'
    },
    {
      title: 'Human Approvals',
      value: stats.human_approvals,
      icon: CheckCircle,
      description: 'Approved auto-replies',
      color: 'text-green-600'
    },
    {
      title: 'Human Rejections',
      value: stats.human_rejections,
      icon: Clock,
      description: 'Rejected auto-replies',
      color: 'text-red-600'
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight gradient-text">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Monitor your agent's performance in real-time
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={fetchEmails} className="gap-2 shadow-lg hover:shadow-primary/20 transition-all duration-300">
            <Mail className="h-4 w-4" />
            Scan Inbox
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, i) => (
          <Card key={stat.title} className="glass dark:glass-dark border-none shadow-xl hover:scale-[1.02] transition-transform duration-300" style={{ animationDelay: `${i * 100}ms` }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className="p-2 rounded-xl bg-background/50">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mt-1">{(stat.value || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-2 font-medium">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass border-none shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Clock className="h-24 w-24" />
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Clock className="h-5 w-5 text-blue-500" />
              Pulse Check
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats.last_check 
                ? new Date(stats.last_check).toLocaleTimeString()
                : 'Standby'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Latest activity snapshot. Next scan in ~{5} minutes.
            </p>
          </CardContent>
        </Card>

        <Card className="glass border-none shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <ShieldCheck className="h-24 w-24" />
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-5 w-5 text-green-500" />
              System Integrity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
              <span className="text-2xl font-bold">Operational</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Backend secure & connected via encrypted gateway
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass border-none shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 to-transparent p-6 border-b border-white/10">
          <CardTitle className="text-xl">Intelligence Command</CardTitle>
          <CardDescription className="mt-1">
            Core agent modules and control panels
          </CardDescription>
        </div>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-6">
          <Button variant="outline" className="gap-3 h-24 flex-col border-white/10 bg-white/5 hover:bg-white/10 transition-all group">
            <Mail className="h-7 w-7 text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">Email Vault</span>
          </Button>
          <Button variant="outline" className="gap-3 h-24 flex-col border-white/10 bg-white/5 hover:bg-white/10 transition-all group">
            <Star className="h-7 w-7 text-yellow-400 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">Priority Feed</span>
          </Button>
          <Button variant="outline" className="gap-3 h-24 flex-col border-white/10 bg-white/5 hover:bg-white/10 transition-all group">
            <MessageSquare className="h-7 w-7 text-purple-400 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">Bridge (TG)</span>
          </Button>
          <Button variant="outline" className="gap-3 h-24 flex-col border-white/10 bg-white/5 hover:bg-white/10 transition-all group">
            <Settings className="h-7 w-7 text-slate-400 group-hover:rotate-45 transition-transform" />
            <span className="font-semibold">Core Config</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
