'use client';

// Champs du format visé — type de format, dimensions, nombre d'exemplaires,
// moule du référentiel, nombre de parts. Partagés par l'étape 2 du parcours
// actuel (`ProjectWizard`) et par le bloc « Format » de la v2
// (`ProjectV2`) : composant contrôlé, sans écriture — chaque écran garde son
// propre geste d'enregistrement, mais contrôle et écrit la même chose via
// `buildProjectFormatUpdate` (lib/projects.ts).
import { PROJECT_FORMATS, PROJECT_FORMAT_KEYS, type ProjectFormat } from '@/lib/projects';

export type MoldTypeOption = { id: number; name: string; forme: string | null };

export function ProjectFormatFields({
  moldTypes,
  format,
  setFormat,
  dims,
  setDims,
  count,
  setCount,
  moldTypeId,
  setMoldTypeId,
  servings,
  setServings,
  disabled = false,
}: {
  moldTypes: MoldTypeOption[];
  format: ProjectFormat;
  setFormat: (f: ProjectFormat) => void;
  dims: Record<string, string>;
  setDims: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  count: string;
  setCount: (v: string) => void;
  moldTypeId: string;
  setMoldTypeId: (v: string) => void;
  servings: string;
  setServings: (v: string) => void;
  disabled?: boolean;
}) {
  const moldsForFormat = moldTypes.filter((m) => {
    const forme = PROJECT_FORMATS[format].forme;
    return !forme || m.forme === forme;
  });

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROJECT_FORMAT_KEYS.map((f) => (
          <button
            key={f}
            type="button"
            disabled={disabled}
            onClick={() => {
              setFormat(f);
              // Le moule choisi dans le référentiel ne vaut que pour sa
              // forme : changer de format le remet « à préciser ».
              if (f !== format) setMoldTypeId('');
            }}
            className={`rounded-xl border p-4 text-left transition-colors ${
              format === f ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary'
            }`}
          >
            <span className="block font-label-md text-[13px] font-semibold text-on-surface">
              {PROJECT_FORMATS[f].label}
            </span>
            <span className="block text-[12px] text-on-surface-variant">{PROJECT_FORMATS[f].hint}</span>
          </button>
        ))}
      </div>

      {(PROJECT_FORMATS[format].dims.length > 0 || PROJECT_FORMATS[format].countLabel) && (
        <div className="flex flex-wrap gap-4">
          {PROJECT_FORMATS[format].dims.map((d) => (
            <div key={d.key}>
              <label className="mb-1 block font-label-md text-label-md text-outline">{d.label.toUpperCase()} (CM)</label>
              <input
                value={dims[d.key] ?? ''}
                onChange={(e) => setDims((prev) => ({ ...prev, [d.key]: e.target.value }))}
                disabled={disabled}
                inputMode="decimal"
                className="w-32 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
              />
            </div>
          ))}
          {PROJECT_FORMATS[format].countLabel && (
            <div>
              <label className="mb-1 block font-label-md text-label-md text-outline">
                {PROJECT_FORMATS[format].countLabel?.toUpperCase()}
              </label>
              <input
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={disabled}
                inputMode="numeric"
                className="w-32 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
              />
            </div>
          )}
        </div>
      )}

      {format !== 'free' && (
        <div>
          <label className="mb-1 block font-label-md text-label-md text-outline">MOULE (RÉFÉRENTIEL)</label>
          <select
            value={moldTypeId}
            onChange={(e) => setMoldTypeId(e.target.value)}
            disabled={disabled}
            className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
          >
            <option value="">— À préciser —</option>
            {moldsForFormat.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            Le moule sert au calcul des quantités : deux cercles de diamètres différents ne demandent pas la même
            recette.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block font-label-md text-label-md text-outline">NOMBRE DE PARTS</label>
        <input
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          disabled={disabled}
          inputMode="numeric"
          className="w-32 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
        />
      </div>
    </>
  );
}
