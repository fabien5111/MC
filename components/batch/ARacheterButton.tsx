'use client';

// Picto « À racheter » d'une ligne d'ingrédient du mode Pâtisser (JEP-379) :
// un seul geste, « je finis le paquet, il faut en racheter ». Ajoute le nom
// seul à la liste de courses « À racheter » par `POST /api/courses/a-racheter`.
//
// Pas de voile plein écran : l'action est instantanée et se fait les mains
// dans la pâte — le picto devient une coche quelques secondes. Un ingrédient
// déjà dans la liste n'est pas ajouté une seconde fois, un message le dit.
import { useEffect, useRef, useState } from 'react';
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { LockedAction } from '@/components/LockedAction';

const CONFIRMATION_MS = 2500;

export function ARacheterButton({ nom, refId, autorise }: { nom: string; refId: number | null; autorise: boolean }) {
  const dialog = useDialog();
  const guard = useWriteGuard();
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ajoute'>('repos');
  const [titre, setTitre] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!autorise) {
    return (
      <LockedAction
        label="Ajouter à la liste « À racheter »"
        message="La liste de courses « À racheter » n'est pas incluse dans votre formule."
        className="shrink-0 rounded p-1.5"
      />
    );
  }

  async function ajouter() {
    if (etat === 'envoi' || !guard('Ajout à la liste « À racheter »')) return;
    setEtat('envoi');
    try {
      const res = await fetch('/api/courses/a-racheter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, refId }),
      });
      const data = (await res.json().catch(() => ({}))) as { action?: string; message?: string; erreur?: string };
      if (!res.ok) {
        setEtat('repos');
        dialog.alert(data.erreur || 'Ajout impossible pour le moment.');
        return;
      }
      if (data.action === 'deja') {
        setEtat('repos');
        dialog.alert(data.message || 'Cet ingrédient est déjà dans la liste « À racheter ».');
        return;
      }
      setTitre(data.message || 'Ajouté à la liste « À racheter ».');
      setEtat('ajoute');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setEtat('repos'), CONFIRMATION_MS);
    } catch {
      setEtat('repos');
      dialog.alert('Ajout impossible : vérifiez votre connexion.');
    }
  }

  const ajoute = etat === 'ajoute';
  return (
    <button
      type="button"
      onClick={(ev) => {
        // Dans le `<label>` de la ligne : sans ça, le clic cocherait aussi
        // l'ingrédient.
        ev.preventDefault();
        ev.stopPropagation();
        ajouter();
      }}
      disabled={etat === 'envoi'}
      title={ajoute ? titre : 'Ajouter à la liste « À racheter »'}
      aria-label={ajoute ? titre : `Ajouter « ${nom} » à la liste « À racheter »`}
      aria-live="polite"
      className={`no-print shrink-0 rounded p-1.5 transition-colors ${ajoute ? 'text-green-700' : 'text-primary hover:bg-primary/10'} ${
        etat === 'envoi' ? 'opacity-50' : ''
      }`}
    >
      <span className="material-symbols-outlined text-[22px]">{ajoute ? 'check_circle' : 'add_shopping_cart'}</span>
    </button>
  );
}
