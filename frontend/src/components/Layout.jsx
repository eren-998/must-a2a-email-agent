import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Mail, 
  Settings, 
  MessageCircle,
  Bot,
  BrainCircuit,
  LogOut
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { Button } from './ui/button';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Emails', href: '/emails', icon: Mail },
  { name: 'Memory', href: '/memory', icon: BrainCircuit },
  { name: 'Telegram', href: '/telegram', icon: MessageCircle },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-background selection:bg-primary/30">
      <nav className="sticky top-0 z-50 glass border-b border-white/10 dark:glass-dark shadow-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2 group">
              <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Bot className="h-6 w-6 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <span className="font-bold text-xl tracking-tight gradient-text">Agentic</span>
            </Link>
            <div className="hidden md:flex items-center space-x-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", isActive && "animate-pulse")} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center space-x-4">
             <Button 
                variant="ghost" 
                size="icon" 
                onClick={logout} 
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                title="Logout"
              >
               <LogOut className="h-5 w-5" />
             </Button>
          </div>
        </div>
      </nav>
      <main className="container py-8 pb-20 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
