'use client';

// Photo de signature des e-mails (JEP-378) : affichée sous « L'équipe de Je
// pâtisse ! » dans TOUS les e-mails envoyés par l'application (gabarit unique,
// `lib/email-gabarit.ts`). Même geste que RecipeDefaultPhotoManager : dépôt sur
// le stockage objet, l'URL — jamais la data-URL — dans `site_settings`.
//
// **Format imposé : 1600 × 320 px.** `ImageSlot` ouvre le recadrage au ratio
// 5:1 dès le dépôt et produit l'image à 1600 px de large ; la photo non
// recadrée qu'il transmet d'abord est ignorée, pour qu'une photo au mauvais
// format ne parte jamais dans les e-mails. JPEG plutôt que WebP : plusieurs
// messageries (Outlook) n'affichent pas le WebP.
//
// **Lien de la photo** (facultatif, `site_settings.email_signature_link`) : un
// clic sur la photo dans l'e-mail ouvre cette adresse. `https://` seulement
// (`lienSignatureValide`), revérifié à l'envoi. Vide : photo non cliquable.
//
// Lus par `sendEmail` avec un cache de 5 minutes : un changement apparaît dans
// les e-mails au plus 5 minutes plus tard.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageSlot } from '@/components/ImageSlot';
import { useDialog } from '@/components/Dialog';
import { televerserImage } from '@/lib/storage-client';
import {
  CLE_LIEN_SIGNATURE,
  CLE_PHOTO_SIGNATURE,
  PHOTO_SIGNATURE_HAUTEUR,
  PHOTO_SIGNATURE_LARGEUR,
  lienSignatureValide,
} from '@/lib/email-gabarit';

/** Dimensions d'une data-URL d'image (navigateur). */
function dimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = dataUrl;
  });
}

export function EmailSignaturePhotoManager({ initialUrl, initialLien }: { initialUrl: string | null; initialLien: string }) {
  const router = useRouter();
  const dialog = useDialog();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState('');
  const [lien, setLien] = useState(initialLien);
  const [lienEnregistre, setLienEnregistre] = useState(initialLien);
  const [statutLien, setStatutLien] = useState('');

  async function enregistrerLien() {
    const saisi = lien.trim();
    const valide = saisi ? lienSignatureValide(saisi) : null;
    if (saisi && !valide) {
      setStatutLien('Adresse invalide : elle doit commencer par https://');
      return;
    }
    setStatutLien('Enregistrement…');
    try {
      const supabase = createClient();
      const { error } = await supabase.from('site_settings').upsert({ key: CLE_LIEN_SIGNATURE, value: valide });
      if (error) throw error;
      setLien(valide ?? '');
      setLienEnregistre(valide ?? '');
      router.refresh();
      setStatutLien(valide ? 'Lien enregistré ✓ — actif dans les e-mails d’ici 5 minutes.' : 'Lien retiré ✓');
    } catch (e) {
      setStatutLien('');
      dialog.alert('Erreur lors de l’enregistrement : ' + (e as Error).message);
    }
  }

  async function save(dataUrl: string) {
    const { w, h } = await dimensions(dataUrl).catch(() => ({ w: 0, h: 0 }));
    if (Math.abs(w - PHOTO_SIGNATURE_LARGEUR) > 2 || Math.abs(h - PHOTO_SIGNATURE_HAUTEUR) > 2) {
      setStatus(`Recadrez la photo au format ${PHOTO_SIGNATURE_LARGEUR} × ${PHOTO_SIGNATURE_HAUTEUR} px pour l'enregistrer.`);
      return;
    }
    setStatus('Enregistrement…');
    try {
      const urlFinale = await televerserImage('banniere', dataUrl);
      const supabase = createClient();
      const { error } = await supabase.from('site_settings').upsert({ key: CLE_PHOTO_SIGNATURE, value: urlFinale });
      if (error) throw error;
      setUrl(urlFinale);
      router.refresh();
      setStatus('Photo enregistrée ✓ — visible dans les e-mails d’ici 5 minutes.');
    } catch (e) {
      setStatus('');
      dialog.alert('Erreur lors de l’enregistrement : ' + (e as Error).message);
    }
  }

  async function clear() {
    const ok = await dialog.confirm('Retirer la photo de signature ? Les e-mails partiront sans photo.');
    if (!ok) return;
    setStatus('Suppression…');
    try {
      const supabase = createClient();
      const { error } = await supabase.from('site_settings').upsert({ key: CLE_PHOTO_SIGNATURE, value: null });
      if (error) throw error;
      setUrl(null);
      router.refresh();
      setStatus('');
    } catch (e) {
      setStatus('');
      dialog.alert('Erreur lors de la suppression : ' + (e as Error).message);
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 ambient-shadow">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-headline-md text-xl text-primary">Signature des e-mails</h3>
        <span className="text-xs font-label-md text-on-surface-variant">
          {PHOTO_SIGNATURE_LARGEUR} × {PHOTO_SIGNATURE_HAUTEUR} px
        </span>
      </div>
      <ImageSlot
        src={url}
        onChange={save}
        onClear={url ? clear : undefined}
        aspectRatio={PHOTO_SIGNATURE_LARGEUR / PHOTO_SIGNATURE_HAUTEUR}
        maxWidth={PHOTO_SIGNATURE_LARGEUR}
        mime="image/jpeg"
        shape="rounded"
        placeholder="Déposez une photo"
        alt="Photo de signature des e-mails"
        className="aspect-[5/1] w-full mb-4"
      />
      <span className="text-sm text-on-surface-variant">{status}</span>
      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="lien-signature" className="text-sm font-label-md text-on-surface">
          Lien de la photo (facultatif)
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="lien-signature"
            type="url"
            inputMode="url"
            placeholder="https://www.jepatisse.com"
            value={lien}
            onChange={(e) => {
              setLien(e.target.value);
              setStatutLien('');
            }}
            className="flex-1 min-w-0 rounded-lg border border-outline-variant bg-surface px-3 py-2"
          />
          <button
            type="button"
            onClick={enregistrerLien}
            disabled={lien.trim() === lienEnregistre.trim()}
            className="rounded-full bg-primary text-on-primary px-5 py-2 font-label-md disabled:opacity-40"
          >
            Enregistrer le lien
          </button>
        </div>
        <span className="text-sm text-on-surface-variant">
          {statutLien || 'Un clic sur la photo dans l’e-mail ouvre cette adresse. Vide : la photo n’est pas cliquable.'}
        </span>
      </div>
    </div>
  );
}
