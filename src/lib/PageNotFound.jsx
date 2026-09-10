import { Link, useLocation } from 'react-router-dom';
import Logo from '@/components/Logo';

export default function PageNotFound() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="max-w-md w-full text-center">
        <Logo size={56} className="mb-6" />
        <p className="font-display font-bold text-6xl text-muted-foreground/40 mb-2">404</p>
        <h1 className="font-display font-bold text-2xl mb-2">page not found</h1>
        <p className="text-sm text-muted-foreground mb-8 break-words">
          Nothing lives at <span className="font-mono text-foreground/80">{location.pathname}</span>.
        </p>
        <Link to="/" className="c3-btn-primary">go home</Link>
      </div>
    </div>
  );
}
