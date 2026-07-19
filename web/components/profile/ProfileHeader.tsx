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
import { PROFILE_LINKS, activeLinks, normalizeUrl, type ProfileLinkField } from '@/lib/profile-links';
import type { Profile } from '@/lib/auth';

type LinkValues = Partial<Record<ProfileLinkField, string>>;

export function ProfileHeader({
  userId,
  profile,
  fallbackName,
  fallbackAvatar,
  isAdmin,
}: {
  userId: string;
  profile: Profile | null;
  fallbackName: string;
  fallbackAvatar: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<string | null>(
    profile?.avatar_url && !profile.avatar_url.includes('googleusercontent.com')
      ? profile.avatar_url
      : fallbackAvatar,
  );
  const [banner, setBanner] = useState<string | null>(profile?.banner_url ?? null);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [links, setLinks] = useState<LinkValues>(() => {
    const v: LinkValues = {};
    for (const l of PROFILE_LINKS) v[l.field] = profile?.[l.field] ?? '';
    return v;
  });

  const [bioExpanded, setBioExpanded] = useState(false);
  const [showBioToggle, setShowBioToggle] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    const el = bioRef.current;
    if (el) setShowBioToggle(el.scrollHeight > el.clientHeight + 2);
  }, [bio, bioExpanded]);

  async function saveImage(field: 'avatar_url' | 'banner_url', dataUrl: string) {
    const supabase = createClient();
    if (field === 'avatar_url') {
      const { error } = await supabase.from('profiles').upsert({ id: userId, avatar_url: dataUrl });
      if (error) return void alert('Erreur lors du téléchargement : ' + error.message);
      setAvatar(dataUrl);
      router.refresh(); // met à jour l'avatar de la nav (Header serveur)
    } else {
      const { error } = await supabase.from('profiles').upsert({ id: userId, banner_url: dataUrl });
      if (error) return void alert('Erreur lors du téléchargement : ' + error.message);
      setBanner(dataUrl);
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
            <button
              onClick={() => setEditorOpen(true)}
              className="flex items-center gap-2 border border-primary text-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary hover:text-white transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span> Modifier le profil
            </button>
            <ShareProfileButton />
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary text-center md:text-left">
            {name}
          </h1>
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
            <span className="block font-headline-md text-primary">
              {profile?.followers_count ?? 0}
            </span>
            <span className="font-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
              Abonnés
            </span>
          </div>
          <div className="text-center md:text-left">
            <span className="block font-headline-md text-primary">
              {profile?.following_count ?? 0}
            </span>
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
          initialLinks={links}
          onClose={() => setEditorOpen(false)}
          onSaved={(newBio, newLinks) => {
            setBio(newBio);
            setLinks(newLinks);
            setEditorOpen(false);
          }}
        />
      )}
    </section>
  );
}

function ShareProfileButton() {
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
      alert('Lien copié dans le presse-papiers.');
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

function ProfileEditor({
  userId,
  initialBio,
  initialLinks,
  onClose,
  onSaved,
}: {
  userId: string;
  initialBio: string;
  initialLinks: LinkValues;
  onClose: () => void;
  onSaved: (bio: string, links: LinkValues) => void;
}) {
  const [bio, setBio] = useState(initialBio);
  const [links, setLinks] = useState<LinkValues>(initialLinks);
  const [busy, setBusy] = useState(false);
  const IN = 'border border-outline-variant rounded px-3 py-2 font-body-md text-sm';
  const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

  async function save() {
    setBusy(true);
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
      alert('Erreur lors de l’enregistrement : ' + error.message);
      setBusy(false);
      return;
    }
    onSaved(bio.trim(), links);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto">
        <h3 className="font-headline-md text-primary mb-6">Modifier le profil</h3>
        <div className="flex flex-col gap-5">
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
