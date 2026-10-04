'use client';

// En-tête du profil (porté de profil.html) : bannière + avatar avec upload
// (data-URL dans profiles), nom, bio repliable, éditeur de profil (bio + liens),
// liens réseaux, bouton admin. Uploads/enregistrements via le client Supabase
// navigateur ; router.refresh() propage l'avatar au Header serveur.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageSlot } from '@/components/ImageSlot';
import { createClient } from '@/lib/supabase/client';
import { televerserImage } from '@/lib/storage-client';
import { useReadOnly, useWriteGuard } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { PROFILE_LINKS, activeLinks, normalizeUrl, type ProfileLinkField } from '@/lib/profile-links';
import type { Profile } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import {
  nettoyerSaisiePseudo,
  normaliserCassePseudo,
  PSEUDO_DELAI_CHANGEMENT_JOURS,
  PSEUDO_MAX_LENGTH,
  PSEUDO_MIN_LENGTH,
  pseudoSlug,
  validerPseudo,
} from '@/lib/pseudo';

type LinkValues = Partial<Record<ProfileLinkField, string>>;

export function ProfileHeader({
  userId,
  profile,
  fallbackName,
  fallbackAvatar,
  isAdmin,
  followCounts,
  prochainChangementPseudo,
}: {
  userId: string;
  profile: Profile | null;
  fallbackName: string;
  fallbackAvatar: string | null;
  isAdmin: boolean;
  // Recalculés depuis `follows` par le serveur (lib/follows.ts `getFollowCounts`)
  // — `profiles.followers_count` / `following_count` ne sont jamais écrites,
  // les lire ici affichait toujours 0.
  followCounts: { followers: number; following: number };
  // Date (ISO) avant laquelle le pseudo ne peut plus changer d'adresse, `null`
  // si le membre peut changer dès maintenant — calculée par le serveur
  // (lib/pseudo.ts `prochainChangementPseudo`), jamais ici.
  prochainChangementPseudo: string | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [avatar, setAvatar] = useState<string | null>(
    profile?.avatar_url && !profile.avatar_url.includes('googleusercontent.com')
      ? profile.avatar_url
      : fallbackAvatar,
  );
  const [banner, setBanner] = useState<string | null>(profile?.banner_url ?? null);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [links, setLinks] = useState<LinkValues>(() => {
    const v: LinkValues = {};
    for (const l of PROFILE_LINKS) v[l.field] = profile?.[l.field] ?? '';
    return v;
  });

  const [bioExpanded, setBioExpanded] = useState(false);
  const [showBioToggle, setShowBioToggle] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Impersonation en lecture seule : édition du profil masquée et uploads bloqués.
  const readOnly = useReadOnly();
  const writeGuard = useWriteGuard();

  useEffect(() => {
    const el = bioRef.current;
    if (el) setShowBioToggle(el.scrollHeight > el.clientHeight + 2);
  }, [bio, bioExpanded]);

  async function saveImage(field: 'avatar_url' | 'banner_url', dataUrl: string) {
    if (!writeGuard('Photo de profil')) return;
    // `onChange` d'ImageSlot n'est pas attendu par l'appelant (fonction
    // `void`) : une erreur de dépôt doit donc être interceptée ici, jamais
    // laissée remonter en rejet de promesse non géré (§ 7.5, lot B2).
    let url: string;
    try {
      url = await televerserImage('profil', dataUrl);
    } catch (e) {
      dialog.alert('Erreur lors du téléchargement : ' + (e as Error).message);
      return;
    }
    const supabase = createClient();
    if (field === 'avatar_url') {
      const { error } = await supabase.from('profiles').upsert({ id: userId, avatar_url: url });
      if (error) return void dialog.alert('Erreur lors du téléchargement : ' + error.message);
      setAvatar(url);
      router.refresh(); // met à jour l'avatar de la nav (Header serveur)
    } else {
      const { error } = await supabase.from('profiles').upsert({ id: userId, banner_url: url });
      if (error) return void dialog.alert('Erreur lors du téléchargement : ' + error.message);
      setBanner(url);
      router.refresh(); // aligne le rendu serveur du profil sur la nouvelle bannière
    }
  }

  const name = profile?.full_name || fallbackName;
  const shown = activeLinks({ ...profile, ...links } as Profile);

  return (
    <section className="relative mt-8">
      {/* Bannière */}
      <div className="h-64 md:h-80 w-full rounded-xl overflow-hidden bg-surface-container-high relative">
        <ImageSlot
          src={banner}
          onChange={(d) => saveImage('banner_url', d)}
          shape="rect"
          maxWidth={1400}
          placeholder="Bannière du profil"
          className="w-full h-full"
          editTitle="Changer la bannière (taille idéale : 1400 × 400 px)"
        />
      </div>

      <div className="px-8 relative z-10 md:flex md:items-start md:gap-8">
        {/* Avatar */}
        <div className="w-32 h-32 md:w-40 md:h-40 relative -mt-16 mx-auto md:mx-0 shrink-0">
          <div className="w-full h-full rounded-full border-4 border-background overflow-hidden bg-surface-container shadow-lg">
            <ImageSlot
              src={avatar}
              onChange={(d) => saveImage('avatar_url', d)}
              shape="circle"
              maxWidth={400}
              placeholder="Photo"
              className="w-full h-full"
              editTitle="Changer la photo de profil"
              editButtonClassName="bottom-1 right-1 w-9 h-9"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 pt-4">
          <div className="relative z-10 flex gap-3 justify-center md:justify-end mt-4 md:mt-0 md:float-right md:ml-8 md:mb-2">
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-2 border border-primary text-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary hover:text-white transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>{' '}
                Administration
              </Link>
            )}
            {!readOnly && (
              <button
                onClick={() => setEditorOpen(true)}
                className="flex items-center gap-2 border border-primary text-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary hover:text-white transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span> Modifier le profil
              </button>
            )}
            <ShareProfileButton />
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary text-center md:text-left">
            {name}
          </h1>
          <Link
            href={`/u/${username || userId}`}
            className="block text-center md:text-left font-label-md text-label-md text-secondary hover:text-primary transition-colors mb-1"
          >
            Voir mon profil public →
          </Link>
          <p
            ref={bioRef}
            className={`font-body-md text-on-surface-variant text-justify ${
              bioExpanded ? '' : 'line-clamp-3'
            }`}
            style={{ clear: 'right' }}
          >
            {bio}
          </p>
          {showBioToggle && (
            <button
              type="button"
              onClick={() => setBioExpanded((v) => !v)}
              className="font-label-md text-label-md text-primary hover:underline mt-1"
            >
              {bioExpanded ? 'Replier' : 'Voir plus'}
            </button>
          )}
          <div style={{ clear: 'both' }} />
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center mt-6 pt-6 border-t border-outline-variant/30">
        <div className="flex gap-8 mb-4 md:mb-0">
          <div className="text-center md:text-left">
            <span className="block font-headline-md text-primary">{followCounts.followers}</span>
            <span className="font-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
              Abonnés
            </span>
          </div>
          <div className="text-center md:text-left">
            <span className="block font-headline-md text-primary">{followCounts.following}</span>
            <span className="font-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
              Abonnements
            </span>
          </div>
        </div>
        {shown.length > 0 && (
          <div className="flex gap-4">
            {shown.map((l) => (
              <a
                key={l.field}
                href={normalizeUrl(links[l.field] || profile?.[l.field] || '')}
                target="_blank"
                rel="noopener noreferrer"
                title={l.label}
                className="w-10 h-10 flex items-center justify-center rounded-full border border-outline-variant text-secondary hover:bg-primary hover:text-white transition-all"
              >
                {l.svg ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d={l.svg} />
                  </svg>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">{l.icon}</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>

      {editorOpen && (
        <ProfileEditor
          userId={userId}
          initialBio={bio}
          initialPseudo={profile?.full_name ?? ''}
          initialUsername={username}
          prochainChangement={prochainChangementPseudo}
          initialLinks={links}
          onClose={() => setEditorOpen(false)}
          onSaved={(newBio, newUsername, newLinks) => {
            setBio(newBio);
            setUsername(newUsername);
            setLinks(newLinks);
            setEditorOpen(false);
            router.refresh(); // bio et liens viennent des props serveur
          }}
        />
      )}
    </section>
  );
}

function ShareProfileButton() {
  const dialog = useDialog();
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        // annulation par l'utilisateur : rien à faire
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      dialog.alert('Lien copié dans le presse-papiers.');
    } catch {
      // presse-papiers indisponible : rien à faire
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="p-3 border border-outline-variant rounded-lg text-primary hover:bg-surface-container transition-all active:scale-95"
    >
      <span className="material-symbols-outlined">share</span>
    </button>
  );
}

// Le pseudo est UNE seule saisie qui alimente deux colonnes : `full_name` (le
// nom affiché, casse et accents gardés) et `username` (l'adresse du profil
// public `/u/…`, dérivée du pseudo par `pseudoSlug`). L'adresse n'est donc plus
// un champ libre : elle suit le pseudo, et les deux ne peuvent plus diverger.
//
// L'enregistrement passe par `/api/pseudo/choisir`, qui revalide tout (format,
// unicité, contrôle IA, délai entre deux changements) et écrit avec la clé
// service_role : le navigateur n'écrit jamais `full_name` / `username` lui-même
// (cf. CLAUDE.md « Pseudo »). Seuls la bio et les liens partent encore en
// écriture directe.
const PSEUDO_CHECK_DEBOUNCE_MS = 300;

function ProfileEditor({
  userId,
  initialBio,
  initialPseudo,
  initialUsername,
  prochainChangement,
  initialLinks,
  onClose,
  onSaved,
}: {
  userId: string;
  initialBio: string;
  initialPseudo: string;
  initialUsername: string;
  prochainChangement: string | null;
  initialLinks: LinkValues;
  onClose: () => void;
  onSaved: (bio: string, username: string, links: LinkValues) => void;
}) {
  const dialog = useDialog();
  const [bio, setBio] = useState(initialBio);
  const [pseudo, setPseudo] = useState(initialPseudo);
  const [links, setLinks] = useState<LinkValues>(initialLinks);
  const [busy, setBusy] = useState(false);
  const IN = 'border border-outline-variant rounded px-3 py-2 font-body-md text-sm';
  const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

  const validation = validerPseudo(pseudo);
  const slug = validation.ok ? validation.slug : pseudoSlug(pseudo);
  const pseudoChange = validation.ok && validation.pseudo !== initialPseudo;
  // Le délai ne porte que sur l'adresse : rectifier la casse ou les accents
  // (même slug) reste libre, comme côté serveur.
  const adresseChange = validation.ok && validation.slug !== initialUsername;
  const echeance = prochainChangement && new Date(prochainChangement).getTime() > Date.now() ? prochainChangement : null;
  const verrouille = !!echeance && adresseChange;

  // Disponibilité en direct (unicité seule, sans IA) — motif `PseudoChooser` :
  // un confort d'affichage, la vérification qui fait foi est celle de la route.
  const [pseudoCheck, setPseudoCheck] = useState<'idle' | 'checking' | 'ok' | 'ko'>('idle');
  const [pseudoCheckMessage, setPseudoCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!validation.ok || !pseudoChange) {
      setPseudoCheck('idle');
      setPseudoCheckMessage(null);
      return;
    }
    setPseudoCheck('checking');
    const controller = new AbortController();
    const candidat = validation.pseudo;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/pseudo/verifier', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pseudo: candidat, verifierIA: false }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        if (data?.ok) {
          setPseudoCheck('ok');
          setPseudoCheckMessage(null);
        } else {
          setPseudoCheck('ko');
          setPseudoCheckMessage(data?.message || `Le pseudo « ${candidat} » est déjà pris.`);
        }
      } catch {
        // Requête annulée (nouvelle frappe) ou réseau indisponible : la
        // vérification à l'envoi tranchera.
        setPseudoCheck('idle');
      }
    }, PSEUDO_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `validation.pseudo` dérive de `pseudo`.
  }, [validation.ok, validation.ok ? validation.pseudo : null, pseudoChange]);

  async function save() {
    // Le pseudo marque aussi « ce compte a un pseudo » (cf. `requireUser`,
    // lib/auth.ts) : le vider renverrait le membre sur `/choix-pseudo` à la
    // page privée suivante, sans qu'il comprenne pourquoi.
    if (!validation.ok) {
      dialog.alert(validation.message);
      return;
    }
    if (verrouille) {
      dialog.alert(
        `Vous avez déjà changé de pseudo récemment : un nouveau changement est possible à partir du ${formatDate(echeance)}.`,
      );
      return;
    }
    if (pseudoCheck === 'ko') {
      dialog.alert(pseudoCheckMessage || 'Ce pseudo est déjà pris.');
      return;
    }
    setBusy(true);

    // Le pseudo d'abord : un refus (pris, non autorisé, délai) interrompt tout,
    // sans que la bio ou les liens aient été enregistrés à moitié.
    let nouvelleAdresse = initialUsername;
    if (pseudoChange || adresseChange) {
      let data: { ok?: boolean; message?: string; slug?: string } | null = null;
      try {
        const res = await fetch('/api/pseudo/choisir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pseudo: validation.pseudo }),
        });
        data = await res.json().catch(() => null);
      } catch {
        data = null;
      }
      if (!data?.ok) {
        dialog.alert(data?.message || "Le pseudo n'a pas pu être enregistré. Réessayez.");
        setBusy(false);
        return;
      }
      nouvelleAdresse = data.slug || validation.slug;
    }

    const clean = (f: ProfileLinkField) => (links[f] || '').trim() || null;
    const payload = {
      id: userId,
      bio: bio.trim() || null,
      website_url: clean('website_url'),
      instagram_url: clean('instagram_url'),
      facebook_url: clean('facebook_url'),
      youtube_url: clean('youtube_url'),
      tiktok_url: clean('tiktok_url'),
      pinterest_url: clean('pinterest_url'),
    };
    const supabase = createClient();
    const { error } = await supabase.from('profiles').upsert(payload);
    if (error) {
      dialog.alert('Erreur lors de l’enregistrement : ' + error.message);
      setBusy(false);
      return;
    }
    onSaved(bio.trim(), nouvelleAdresse, links);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto">
        <h3 className="font-headline-md text-primary mb-6">Modifier le profil</h3>
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1">
            <span className={LBL}>Pseudo</span>
            <input
              type="text"
              className={IN}
              placeholder="MaryseGourmande"
              autoComplete="nickname"
              maxLength={PSEUDO_MAX_LENGTH}
              value={pseudo}
              onChange={(e) => setPseudo(nettoyerSaisiePseudo(e.target.value))}
              onBlur={() => setPseudo((v) => normaliserCassePseudo(v.trim()))}
            />
            <span className="flex items-baseline justify-between gap-3 font-body-md text-xs text-on-surface-variant">
              <span>
                De {PSEUDO_MIN_LENGTH} à {PSEUDO_MAX_LENGTH} caractères. Il fait aussi l&apos;adresse de votre profil
                public.
              </span>
              <span className={pseudo.length >= PSEUDO_MAX_LENGTH ? 'text-error shrink-0' : 'shrink-0'}>
                {pseudo.length}/{PSEUDO_MAX_LENGTH}
              </span>
            </span>
            {slug.length >= PSEUDO_MIN_LENGTH && (
              <span className="font-body-md text-xs text-on-surface-variant">
                Adresse de votre profil : <span className="text-secondary">jepatisse.com/u/{slug}</span>
              </span>
            )}
            {pseudo.length > 0 && !validation.ok && (
              <span className="font-body-md text-xs text-error">{validation.message}</span>
            )}
            {validation.ok && pseudoCheck === 'checking' && (
              <span className="font-body-md text-xs text-on-surface-variant">Vérification du pseudo…</span>
            )}
            {validation.ok && pseudoCheck === 'ko' && (
              <span className="font-body-md text-xs text-error">{pseudoCheckMessage}</span>
            )}
            {verrouille && (
              <span className="font-body-md text-xs text-error">
                Vous avez déjà changé de pseudo récemment : un nouveau changement est possible à partir du{' '}
                {formatDate(echeance)}.
              </span>
            )}
            {!verrouille && adresseChange && (
              <span className="font-body-md text-xs text-on-surface-variant">
                Attention : l&apos;ancienne adresse de votre profil cessera de fonctionner, et vous ne pourrez plus
                changer de pseudo pendant {PSEUDO_DELAI_CHANGEMENT_JOURS} jours.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={LBL}>Bio</span>
            <textarea
              rows={3}
              className={IN}
              placeholder="Quelques mots sur vous…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          {PROFILE_LINKS.map((l) => (
            <label key={l.field} className="flex flex-col gap-1">
              <span className={LBL}>{l.label}</span>
              <input
                type="url"
                className={IN}
                placeholder={l.ph}
                value={links[l.field] || ''}
                onChange={(e) => setLinks((prev) => ({ ...prev, [l.field]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-label-md text-label-md disabled:opacity-60"
          >
            {busy ? '…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-outline px-5 py-2.5 rounded-full font-label-md text-label-md text-on-surface-variant"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
