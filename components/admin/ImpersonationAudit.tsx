// Journal des connexions « en tant que » — back-office.
// Server Component : lecture seule, aucune interactivité.
import { getImpersonationSessions } from '@/lib/impersonation';
import { modeLabel } from '@/lib/impersonation-types';

function horodatage(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function ImpersonationAudit() {
  const sessions = await getImpersonationSessions();

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto mt-8">
      <div className="p-5 border-b border-outline-variant">
        <h3 className="font-headline-md text-base font-semibold">
          Connexions « en tant que »{' '}
          <span className="text-on-surface-variant font-body-md text-sm font-normal">({sessions.length})</span>
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          Chaque génération de lien est tracée, ainsi que les écritures réalisées pendant la session.
        </p>
      </div>
      <table className="w-full text-left border-collapse min-w-[820px]">
        <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
          <tr>
            {['Administrateur', 'Membre', 'Mode', 'Lien généré', 'Session', 'Actions'].map((h) => (
              <th key={h} className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-on-surface-variant text-sm">
                Aucune connexion « en tant que » enregistrée.
              </td>
            </tr>
          ) : (
            sessions.map((s) => {
              const active = s.started_at && !s.ended_at && new Date(s.expires_at).getTime() > Date.now();
              return (
                <tr key={s.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-6 py-3 text-sm">{s.admin_email || '—'}</td>
                  <td className="px-6 py-3 text-sm">{s.target_name || s.target_email || '—'}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        s.mode === 'write'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      {modeLabel(s.mode)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs text-on-surface-variant">{horodatage(s.created_at)}</td>
                  <td className="px-6 py-3 text-xs text-on-surface-variant">
                    {!s.started_at ? (
                      'Lien non utilisé'
                    ) : active ? (
                      <span className="font-semibold text-green-700">En cours</span>
                    ) : (
                      <>
                        {horodatage(s.started_at)} → {s.ended_at ? horodatage(s.ended_at) : 'expirée'}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-center">{s.eventCount}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
