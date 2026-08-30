'use client';

// Compteur de sessions de visite (Admin → fiche membre, « Connexions du
// membre ») : date de connexion, dernière activité, nombre de pages vues.
// Jamais le détail des pages elles-mêmes — cf. CLAUDE.md doctrine egress :
// une écriture à chaque navigation, sur tout le site, contredirait le
// chantier de réduction d'egress déjà mené sur ce projet.
//
// Les pages vues sont donc comptées en mémoire (et persistées dans
// `sessionStorage`, pour survivre à un rechargement) et l'écriture n'est
// envoyée qu'une fois par minute environ, ou quand l'onglet passe en arrière-
// plan — jamais à chaque clic. Une session = un onglet (sessionStorage),
// jusqu'à sa fermeture.
//
// Rien n'est écrit pendant une impersonation (`useImpersonation()` non nul) :
// il ne faut pas mélanger l'activité de l'admin qui observe avec celle du
// membre observé.
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useImpersonation } from '@/components/ImpersonationProvider';

const STORAGE_ID_KEY = 'mc_visit_session_id';
const STORAGE_COUNT_KEY = 'mc_visit_page_count';
const FLUSH_INTERVAL_MS = 60_000;

export function VisitTracker() {
  const pathname = usePathname();
  const impersonation = useImpersonation();
  const initRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const pageCountRef = useRef(0);
  const flushedCountRef = useRef(0);

  // Initialisation : une fois par onglet, pas à chaque navigation. Reprend la
  // session en cours si l'onglet a rechargé la page (sessionStorage), sinon
  // en ouvre une nouvelle.
  useEffect(() => {
    if (impersonation || initRef.current) return;
    initRef.current = true;
    let annule = false;

    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (annule) return;
      const user = data.session?.user;
      if (!user) return; // visiteur non connecté : rien à compter

      const existingId = sessionStorage.getItem(STORAGE_ID_KEY);
      if (existingId) {
        sessionIdRef.current = existingId;
        const existingCount = Number(sessionStorage.getItem(STORAGE_COUNT_KEY));
        pageCountRef.current = Number.isFinite(existingCount) && existingCount > 0 ? existingCount : 1;
        flushedCountRef.current = pageCountRef.current;
        return;
      }

      pageCountRef.current = 1;
      sessionStorage.setItem(STORAGE_COUNT_KEY, '1');
      // `visit_sessions` n'est pas encore dans lib/database.types.ts tant
      // que la migration n'a pas été régénérée — cast local, même motif que
      // lib/admin.ts.
      (supabase as any)
        .from('visit_sessions')
        .insert({ user_id: user.id, page_count: 1 })
        .select('id')
        .single()
        .then(({ data: row, error }: { data: { id: string } | null; error: unknown }) => {
          if (annule || error || !row) return;
          sessionIdRef.current = row.id;
          flushedCountRef.current = 1;
          sessionStorage.setItem(STORAGE_ID_KEY, row.id);
        });
    });

    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impersonation]);

  // Compte chaque changement de route — sans écrire : l'écriture est groupée
  // par le minuteur ci-dessous. La toute première page est déjà comptée à
  // l'initialisation ci-dessus.
  const firstPathRef = useRef(true);
  useEffect(() => {
    if (impersonation) return;
    if (firstPathRef.current) {
      firstPathRef.current = false;
      return;
    }
    pageCountRef.current += 1;
    sessionStorage.setItem(STORAGE_COUNT_KEY, String(pageCountRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Écriture groupée : au plus une fois par minute, plus une dernière fois
  // quand l'onglet passe en arrière-plan (changement d'app, fermeture).
  useEffect(() => {
    if (impersonation) return;

    function flush() {
      if (!sessionIdRef.current || pageCountRef.current === flushedCountRef.current) return;
      const count = pageCountRef.current;
      flushedCountRef.current = count;
      (createClient() as any)
        .from('visit_sessions')
        .update({ page_count: count, last_seen_at: new Date().toISOString() })
        .eq('id', sessionIdRef.current)
        .then(() => {});
    }

    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [impersonation]);

  return null;
}
