'use client';

// Formulaire de connexion / inscription + OAuth (Google, Facebook).
// Porté depuis connexion.html + db.js (authSignIn / authSignUp / signInWith*).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setNotice('Compte créé. Vérifiez vos e-mails pour confirmer, puis connectez-vous.');
        setMode('signin');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: 'google' | 'facebook') {
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}${next}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setError(error.message);
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex gap-2 mb-6">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 py-2 rounded-full font-label-md text-label-md transition-all ${
              mode === m
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:text-primary'
            }`}
          >
            {m === 'signin' ? 'Connexion' : 'Inscription'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === 'signup' && (
          <input
            type="text"
            required
            placeholder="Nom complet"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-body-md focus:border-primary focus:outline-none"
          />
        )}
        <input
          type="email"
          required
          placeholder="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-body-md focus:border-primary focus:outline-none"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-body-md focus:border-primary focus:outline-none"
        />

        {error && <p className="text-sm text-error">{error}</p>}
        {notice && <p className="text-sm text-secondary">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-on-primary py-3 rounded-full font-label-md text-label-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
        >
          {busy ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>

      <div className="flex items-center gap-3 my-6 text-on-surface-variant">
        <span className="h-px flex-1 bg-outline-variant" />
        <span className="text-xs uppercase tracking-widest">ou</span>
        <span className="h-px flex-1 bg-outline-variant" />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => oauth('google')}
          className="w-full border border-outline-variant rounded-full py-3 font-label-md text-label-md text-on-surface hover:bg-surface-container transition-all active:scale-95"
        >
          Continuer avec Google
        </button>
        <button
          type="button"
          onClick={() => oauth('facebook')}
          className="w-full border border-outline-variant rounded-full py-3 font-label-md text-label-md text-on-surface hover:bg-surface-container transition-all active:scale-95"
        >
          Continuer avec Facebook
        </button>
      </div>
    </div>
  );
}
