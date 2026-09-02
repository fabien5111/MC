'use client';

// Outil de test SMTP (AWS SES) : saisie libre destinataire/objet/corps,
// envoi via /api/admin/send-test-email. Rien n'est lu depuis la base ici, donc
// pas de useMutation/router.refresh() à porter : un état local suffit, avec
// LoadingOverlay le temps de l'appel (cf. CLAUDE.md, section « Spinner »).
import { useState } from 'react';
import Link from 'next/link';
import { LoadingOverlay } from '@/components/LoadingOverlay';

const FIELD =
  'w-full bg-surface-container-lowest border border-outline-variant rounded px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors';

export function TestEmailForm() {
  const [email, setEmail] = useState('');
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, objet, corps }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.erreur || 'Envoi impossible.');
      setNotice(`E-mail envoyé à ${email}.`);
      // Champs vidés uniquement en cas de succès : sur un échec, la saisie doit
      // rester en place pour être corrigée et renvoyée. Le destinataire part
      // avec le reste — le message de confirmation le rappelle, il est composé
      // avant le vidage.
      setEmail('');
      setObjet('');
      setCorps('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="h-20 border-b border-outline-variant bg-surface-bright flex items-center px-margin-desktop sticky top-0 z-10">
        <div>
          <h2 className="text-xl font-headline-md font-semibold text-on-surface">Test e-mail</h2>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
            <Link href="/admin" className="hover:text-primary transition-colors">
              Admin
            </Link>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span>Test e-mail</span>
          </div>
        </div>
      </header>

      <div className="p-margin-desktop max-w-xl">
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 bg-surface-container-lowest border border-outline-variant rounded p-6"
        >
          <div className="space-y-1">
            <label className="text-sm font-medium text-secondary" htmlFor="email">
              Destinataire
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@exemple.com"
              className={FIELD}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-secondary" htmlFor="objet">
              Objet
            </label>
            <input id="objet" type="text" required value={objet} onChange={(e) => setObjet(e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-secondary" htmlFor="corps">
              Corps du message
            </label>
            <textarea
              id="corps"
              required
              rows={8}
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              className={FIELD}
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
          {notice && <p className="text-sm text-primary">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="self-start px-6 py-2.5 bg-primary text-on-primary text-sm font-medium rounded hover:opacity-90 transition-all disabled:opacity-60"
          >
            Envoyer
          </button>
        </form>
      </div>

      <LoadingOverlay visible={busy} />
    </>
  );
}
