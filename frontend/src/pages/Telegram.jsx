import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MessageCircle, Send, Bot, CheckCircle, AlertCircle, Terminal, Zap, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';

export default function Telegram() {
  const [pendingActions, setPendingActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { authenticatedFetch } = useAuth();

  useEffect(() => {
    fetchPendingActions();
    const interval = setInterval(fetchPendingActions, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchPendingActions = async () => {
    try {
      const response = await authenticatedFetch('/api/pending-actions?status=pending');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setPendingActions(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch pending actions:', error);
      setLoading(false);
    }
  };

  const handleApprove = async (actionId) => {
    try {
      await authenticatedFetch(`/api/pending-actions/${actionId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'approved' })
      });
      fetchPendingActions();
    } catch (error) {
      console.error('Failed to approve action:', error);
    }
  };

  const handleReject = async (actionId) => {
    try {
      await authenticatedFetch(`/api/pending-actions/${actionId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'rejected' })
      });
      fetchPendingActions();
    } catch (error) {
      console.error('Failed to reject action:', error);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight gradient-text">Command Center</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Synchronized control gateway via Telegram Protocol
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass border-none shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-5">
            <Terminal className="h-32 w-32" />
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <Terminal className="h-5 w-5 text-primary" />
              Protocol Commands
            </CardTitle>
            <CardDescription>
              Instruction set for remote agent oversight
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 relative">
            {[ 
              { cmd: '/status', desc: 'Real-time integrity check' },
              { cmd: '/emails', desc: 'Sync recent transmissions' },
              { cmd: '/summary', desc: 'Request AI synthesis' },
              { cmd: '/read <id>', desc: 'Retrieve full payload' },
              { cmd: '/reply <id> <msg>', desc: 'Initiate response' },
              { cmd: '/star <id>', desc: 'Flag for follow-up' },
              { cmd: '/delete <id>', desc: 'Purge transmission' },
              { cmd: '/send <to> <sub>', desc: 'Broadcast new data' },
              { cmd: '/approve <id>', desc: 'Authorize automation' },
              { cmd: '/reject <id>', desc: 'Terminate auto-sequence' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors group">
                <code className="bg-primary/10 text-primary px-3 py-1 rounded-md text-sm font-bold border border-primary/20 group-hover:scale-105 transition-transform">
                  {item.cmd}
                </code>
                <p className="text-sm text-muted-foreground font-medium opacity-80">{item.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass border-none shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Zap className="h-5 w-5 text-yellow-400" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start gap-4 h-14 rounded-2xl border-white/5 hover:bg-primary/10 transition-all group">
                <div className="p-2 rounded-xl bg-primary/10 group-hover:scale-110 transition-transform">
                  <Send className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-bold">Transmission Test</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Verify Gateway Connectivity</div>
                </div>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-4 h-14 rounded-2xl border-white/5 hover:bg-green-400/10 transition-all group">
                <div className="p-2 rounded-xl bg-green-400/10 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                </div>
                <div className="text-left">
                  <div className="font-bold">System Pulse</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Check Active Heartbeat</div>
                </div>
              </Button>
            </CardContent>
          </Card>

          <Card className="glass border-none shadow-xl border-t-4 border-t-primary/20">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertCircle className="h-5 w-5 text-primary" />
                Pending Approvals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-20">
                  <RefreshCw className="h-8 w-8 animate-spin mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest">Scanning Queue</p>
                </div>
              ) : pendingActions.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-3xl group">
                   <div className="p-4 rounded-full bg-primary/5 w-fit mx-auto mb-3 group-hover:scale-110 transition-transform">
                    <CheckCircle className="h-10 w-10 text-muted-foreground/30" />
                   </div>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">All Actions Resolved</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingActions.map((action) => (
                    <Card key={action.id} className="bg-white/5 border-white/10 shadow-lg overflow-hidden transition-all hover:border-primary/50">
                      <div className="p-4 space-y-4">
                        <div className="flex justify-between items-center bg-white/5 -m-4 p-4 mb-2 border-b border-white/5">
                          <div>
                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Action Sequence</p>
                            <p className="text-xs text-muted-foreground font-mono truncate w-32">{action.id}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-bold">{new Date(action.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="space-y-2 pt-2">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Proposed Synthesis:</p>
                          <div className="text-sm bg-background/50 p-4 rounded-2xl border border-white/5 leading-relaxed italic">
                            "{action.reply_content}"
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleApprove(action.id)}
                            className="gap-2 flex-1 rounded-xl shadow-lg shadow-primary/20"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Authorize
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleReject(action.id)}
                            className="gap-2 flex-1 rounded-xl border-white/10 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                          >
                            <AlertCircle className="h-4 w-4" />
                            Discard
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="glass border-none shadow-xl border-b-4 border-b-primary/5">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Gateway Integration Protocol</CardTitle>
          <CardDescription className="text-lg">
            Standard operating procedure for bot synchronization
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 pt-4">
          {[
            { step: '01', title: 'Spawn Entity', desc: 'Secure bot identity via @BotFather gateway' },
            { step: '02', title: 'Link Identity', desc: 'Initialize handshake via /start command' },
            { step: '03', title: 'Sync Keys', desc: 'Commit secure tokens to Core Configuration' },
            { step: '04', title: 'Deploy Control', desc: 'Remote oversight active across all nodes' }
          ].map((item, i) => (
            <div key={i} className="relative p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
               <span className="absolute top-4 right-6 text-4xl font-black text-primary/10 group-hover:text-primary/20 transition-colors">{item.step}</span>
               <h3 className="font-extrabold text-lg mb-2 relative z-10">{item.title}</h3>
               <p className="text-sm text-muted-foreground leading-relaxed relative z-10">{item.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
