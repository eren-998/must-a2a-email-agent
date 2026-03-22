import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Mail, Star, Trash2, Reply, Search, RefreshCw, Layers, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';

export default function Emails() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const { authenticatedFetch } = useAuth();

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleSendReply = async () => {
    if (!replyContent.trim() || !selectedEmail) return;
    try {
      setSendingReply(true);
      const response = await authenticatedFetch('/api/emails/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          emailId: selectedEmail.id, 
          reply: replyContent 
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send reply');
      
      setIsReplying(false);
      setReplyContent('');
      alert('Reply sent successfully!');
    } catch (error) {
      console.error('Failed to send reply:', error);
      alert(error.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch('/api/emails');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setEmails(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch emails:', error);
      setLoading(false);
    }
  };

  const handleStar = async (emailId) => {
    try {
      await authenticatedFetch(`/api/emails/${emailId}/star`, { method: 'PUT' });
      setEmails(emails.map(e => e.id === emailId ? { ...e, starred: !e.starred } : e));
    } catch (error) {
      console.error('Failed to star email:', error);
    }
  };

  const handleDelete = async (emailId) => {
    if (!confirm('Are you sure you want to delete this email?')) return;
    
    try {
      await authenticatedFetch(`/api/emails/${emailId}`, { method: 'DELETE' });
      setEmails(emails.filter(e => e.id !== emailId));
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }
    } catch (error) {
      console.error('Failed to delete email:', error);
    }
  };

  const handleMarkAsRead = async (emailId) => {
    try {
      await authenticatedFetch(`/api/emails/${emailId}/read`, { method: 'PUT' });
      setEmails(emails.map(e => e.id === emailId ? { ...e, read: true } : e));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const filteredEmails = emails.filter(email => {
    const subject = email.subject || '';
    const from = email.from_email || '';
    const query = searchQuery.toLowerCase();
    return subject.toLowerCase().includes(query) || from.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight gradient-text">Email Vault</h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage your synchronized communications
          </p>
        </div>
        <Button onClick={fetchEmails} variant="outline" className="gap-2 glass hover:bg-primary/10 transition-all border-white/10">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Sync
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search subjects or senders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 glass border-white/10 focus:ring-primary/50 transition-all text-lg py-6"
            />
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 w-full rounded-2xl glass animate-pulse border-white/5" />
                ))}
              </div>
            ) : filteredEmails.length === 0 ? (
              <Card className="glass border-dashed border-2 py-12 text-center border-white/10">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No encrypted communications found</p>
              </Card>
            ) : (
              filteredEmails.map((email, i) => (
                <Card
                  key={email.id}
                  className={cn(
                    "cursor-pointer transition-all duration-300 glass border-white/5 hover:border-primary/30 hover:shadow-lg hover:translate-x-1",
                    selectedEmail?.id === email.id ? 'border-primary/50 bg-primary/5' : '',
                    !email.read ? 'border-l-4 border-l-primary shadow-md' : ''
                  )}
                  style={{ animationDelay: `${i * 50}ms` }}
                  onClick={() => {
                    setSelectedEmail(email);
                    if (!email.read) handleMarkAsRead(email.id);
                  }}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {email.starred && (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                          )}
                          <h3 className={cn("font-bold truncate text-lg", !email.read ? 'text-foreground' : 'text-muted-foreground')}>
                            {email.subject || '(No subject)'}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-semibold text-primary/70">{email.from_email}</span>
                          <span>•</span>
                          <span>{new Date(email.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl hover:bg-yellow-400/10 hover:text-yellow-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStar(email.id);
                          }}
                        >
                          <Star className={cn("h-5 w-5 transition-all", email.starred ? 'fill-yellow-400 text-yellow-400 scale-110' : 'text-muted-foreground')} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(email.id);
                          }}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {selectedEmail ? (
          <div className="w-full lg:w-[450px] shrink-0 animate-in slide-in-from-right-4 duration-500">
            <Card className="glass border-white/10 shadow-2xl sticky top-24 overflow-hidden">
               <div className="h-2 bg-gradient-to-r from-primary to-blue-500" />
              <CardHeader className="pb-4">
                <CardDescription className="flex items-center gap-2 mb-2 font-medium">
                  <span className="p-1 rounded bg-primary/20 text-primary uppercase text-[10px] tracking-widest leading-none">Intelligence Report</span>
                   <span>•</span>
                   <span>{new Date(selectedEmail.timestamp).toLocaleString()}</span>
                </CardDescription>
                <CardTitle className="text-2xl font-extrabold leading-tight">{selectedEmail.subject}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted/20 border border-white/5">
                   <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-12 text-xs font-bold uppercase opacity-50">From</span>
                      <span className="font-semibold text-primary/80 truncate">{selectedEmail.from_email || 'Unknown'}</span>
                   </div>
                   <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-12 text-xs font-bold uppercase opacity-50">To</span>
                      <span className="font-medium truncate opacity-70 italic">
                        {Array.isArray(selectedEmail.to_emails) ? selectedEmail.to_emails.join(', ') : 'Unknown'}
                      </span>
                   </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary/70">
                    <ShieldCheck className="h-4 w-4" />
                    AI Summary
                  </div>
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-sm leading-relaxed shadow-inner">
                    {selectedEmail.summary || 'Strategic analysis pending...'}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                    <Layers className="h-4 w-4 opacity-50" />
                    Full Content
                  </div>
                  <div className="text-sm bg-white/5 p-4 rounded-2xl border border-white/5 max-h-[300px] overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-primary/20">
                    {selectedEmail.body}
                  </div>
                </div>

                <div className="pt-4 flex flex-col gap-3">
                  {isReplying ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Type your reply here..."
                        className="w-full min-h-[120px] p-3 rounded-xl bg-background border border-input text-sm resize-y focus:ring-1 focus:ring-primary"
                        disabled={sendingReply}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button 
                          variant="ghost" 
                          onClick={() => { setIsReplying(false); setReplyContent(''); }}
                          disabled={sendingReply}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleSendReply}
                          disabled={!replyContent.trim() || sendingReply}
                          className="gap-2 shadow-lg"
                        >
                          {sendingReply ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Reply className="h-4 w-4" />
                          )}
                          Send Reply
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button 
                        onClick={() => setIsReplying(true)}
                        className="flex-1 gap-2 shadow-lg hover:shadow-primary/20 transition-all rounded-xl"
                      >
                        <Reply className="h-5 w-5" />
                        Reply
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setSelectedEmail(null)}
                        className="px-6 rounded-xl glass border-white/5"
                      >
                        Close
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="hidden lg:flex w-[450px] items-center justify-center border-2 border-dashed border-white/5 rounded-3xl opacity-20">
             <div className="text-center">
                <Mail className="h-20 w-20 mx-auto mb-4" />
                <p className="font-bold tracking-widest uppercase text-xs">Awaiting Selection</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
