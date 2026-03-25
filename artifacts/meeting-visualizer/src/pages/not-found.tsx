import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="text-center glass-panel p-12 rounded-2xl border-destructive/20 relative z-10 max-w-md w-full">
        <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-6 opacity-80" />
        <h1 className="text-4xl font-display font-bold text-white mb-4 tracking-widest">404</h1>
        <p className="text-muted-foreground font-mono text-sm mb-8">System node not found or access denied.</p>
        <Link href="/">
          <Button variant="outline" className="w-full font-mono uppercase tracking-widest">
            Return to Hub
          </Button>
        </Link>
      </div>
    </div>
  );
}
