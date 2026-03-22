import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { BrainCircuit, Book, Save, Trash2, Edit2, X, Plus } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Input } from '../components/ui/input';

export default function Memory() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const { authenticatedFetch } = useAuth();

  useEffect(() => {
    fetchMemories();
  }, []);

  const fetchMemories = async () => {
    try {
      const response = await authenticatedFetch('/api/memory?limit=50');
      if (response.ok) {
        const data = await response.json();
        setMemories(data);
      }
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (id) => {
    try {
      const response = await authenticatedFetch(`/api/memory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent })
      });
      if (response.ok) {
        setEditingId(null);
        fetchMemories();
      }
    } catch (error) {
      console.error('Failed to update memory:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    try {
      const response = await authenticatedFetch(`/api/memory/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchMemories();
      }
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  };

  const handleAddMemory = async () => {
    if (!newContent.trim()) return;
    try {
      const response = await authenticatedFetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'important', content: newContent })
      });
      if (response.ok) {
        setNewContent('');
        setIsAdding(false);
        fetchMemories();
      }
    } catch (error) {
      console.error('Failed to add memory:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground animate-pulse flex flex-col items-center gap-4">
          <BrainCircuit className="h-8 w-8 text-primary" />
          <p>Loading Agent Memories...</p>
        </div>
      </div>
    );
  }

  const importantMemories = memories.filter(m => m.type === 'important');
  const chatMemories = memories.filter(m => m.type === 'conversation');

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight gradient-text">Agent Memory</h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage the context and knowledge base of your AI agent
          </p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="gap-2 shadow-lg hover:shadow-primary/20 transition-all duration-300">
          <Plus className="h-4 w-4" />
          Add Memory
        </Button>
      </div>

      {isAdding && (
        <Card className="glass border-none shadow-xl border-t-4 border-t-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Book className="h-5 w-5 text-primary" /> 
              Add New Memory
            </CardTitle>
            <CardDescription>Add context like important contacts, preferences, or rules.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="E.g., My boss's email is boss@company.com. Always prioritize emails from him."
                className="w-full min-h-[100px] p-3 rounded-md bg-background border border-input text-sm"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setIsAdding(false); setNewContent(''); }}>Cancel</Button>
                <Button onClick={handleAddMemory}>Save Memory</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
            <Book className="h-6 w-6 text-purple-500" />
            Important Facts & Context
          </h2>
          {importantMemories.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed text-muted-foreground bg-background/50">
              No important memories saved yet. The agent will auto-detect facts from Telegram, or you can add them manually.
            </div>
          ) : (
            importantMemories.map(memory => (
              <Card key={memory.id} className="relative group overflow-hidden shadow-md">
                <CardContent className="p-5">
                  {editingId === memory.id ? (
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full min-h-[80px] p-2 rounded-md bg-background border border-input text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                          <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={() => handleSaveEdit(memory.id)}>
                          <Save className="h-4 w-4 mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <p className="text-sm whitespace-pre-wrap">{memory.content}</p>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                          {new Date(memory.timestamp).toLocaleString()}
                        </span>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(memory)}>
                            <Edit2 className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-500/10" onClick={() => handleDelete(memory.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-4 text-muted-foreground">
            <BrainCircuit className="h-6 w-6" />
            Recent Chat History
          </h2>
          {chatMemories.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed text-muted-foreground bg-background/50">
              No chat history available.
            </div>
          ) : (
            <div className="space-y-3">
              {chatMemories.slice(0, 10).map(memory => (
                <div key={memory.id} className="p-4 rounded-lg bg-muted/50 text-sm border border-transparent hover:border-border transition-colors">
                  <p className="whitespace-pre-wrap">{memory.content}</p>
                  <p className="text-xs text-muted-foreground mt-2 opacity-50">
                    {new Date(memory.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
