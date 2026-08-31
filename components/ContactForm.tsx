'use client';

// Formulaire de contact public (spec §5) — accessible aux visiteurs comme aux
// membres. POST direct à /api/contact : ce n'est pas une écriture Supabase
// (la route écrit avec la clé service_role, cf. docs/contact-jira.md §6), donc
// hors du périmètre de `useMutation`.
//
// Trois couches anti-spam, sans traceur tiers (§5.5) :
//  - honeypot `website`, positionné hors écran (jamais `display:none` seul) ;
//  - délai minimum de 3 s entre affichage et envoi, porté par un jeton SIGNÉ
//    par le serveur (`openedToken`, généré par `app/contact/page.tsx`) — un
//    horodatage lu de l'horloge du navigateur se falsifierait en une ligne de
//    console et ne prouverait rien ;
//  - limitation de débit, appliquée côté route.
//
// Le spinner plein écran (`LoadingOverlay`, doctrine CLAUDE.md) remplace
// l'indicateur local que décrit la spec §5.4 : `aria-busy` sur le bouton
// satisfait l'exigence d'accessibilité, l'overlay satisfait la doctrine
// « jamais d'indicateur local ».
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import {
  CONTACT_TYPE_KEYS,
  CONTACT_TYPES,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUJET_MAX,
  SUJET_MIN,
  premierChampEnErreur,
  type ChampDemande,
  type ContactType,
} from '@/lib/contact';

type ReponseContact =
  | { ok: true; reference: string }
  | { ok: false; errors?: Partial<Record<ChampDemande, string>>; expire?: boolean; retryAfter?: number };

export function ContactForm({
  initialType,
  connectedEmail,
  initialPageUrl,
  appVersion,
  openedToken,
}: {
  initialType?: ContactType;
  connectedEmail: string | null;
  initialPageUrl: string | null;
  appVersion: string | null;
  openedToken: string;
}) {
  const [type, setType] = useState<ContactType | null>(initialType ?? null);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — jamais rempli par un visiteur
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ChampDemande, string>>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  // Page d'origine : celle transmise par « Signaler un problème » (paramètre
  // `url`, cf. AccountMenuItems), sinon la page précédente si elle appartient
  // au site — jamais un référent externe, qui n'apporterait rien au diagnostic.
  const [pageUrl, setPageUrl] = useState<string | null>(initialPageUrl);
  useEffect(() => {
    if (pageUrl !== null) return;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin) setPageUrl(ref.pathname);
    } catch {
      // Référent illisible : tant pis, le champ reste vide.
    }
  }, [pageUrl]);

  const refs: Record<ChampDemande, React.RefObject<HTMLElement | null>> = {
    type: useRef<HTMLElement>(null),
    email: useRef<HTMLElement>(null),
    subject: useRef<HTMLElement>(null),
    message: useRef<HTMLElement>(null),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setGeneralError(null);

    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          email: connectedEmail ? undefined : email,
          subject,
          message,
          website,
          formToken: openedToken,
          pageUrl,
          appVersion,
        }),
      });
      const data = (await res.json().catch(() => null)) as ReponseContact | null;

      if (res.status === 429) {
        setGeneralError('Vous avez déjà envoyé plusieurs messages, merci de patienter.');
        return;
      }
      if (!data || !data.ok) {
        if (data && !data.ok && data.expire) {
          setGeneralError('Ce formulaire est resté ouvert trop longtemps. Rechargez la page et réessayez.');
          return;
        }
        if (data && !data.ok && data.errors) {
          setErrors(data.errors);
          const premier = premierChampEnErreur(data.errors);
          if (premier) refs[premier].current?.focus();
          return;
        }
        setGeneralError("Une erreur est survenue. Merci de réessayer dans un instant.");
        return;
      }

      setReference(data.reference);
      setErrors({});
    } catch {
      setGeneralError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-10 text-center"
      >
        <span className="material-symbols-outlined text-[40px] text-primary">check_circle</span>
        <p className="font-headline-sm text-headline-sm text-primary">Votre demande a bien été envoyée</p>
        <p className="text-on-surface-variant">
          Référence : <span className="font-label-md text-primary">{reference}</span>
        </p>
        <p className="max-w-md text-[13px] text-on-surface-variant">
          Conservez cette référence si vous devez nous la communiquer. Vous recevrez une réponse à l&apos;adresse
          indiquée.
        </p>
      </div>
    );
  }

  return (
    <>
      <LoadingOverlay visible={submitting} label="Envoi de votre demande…" />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* Honeypot — masqué hors écran, jamais par `display:none` seul, et
            retiré de la navigation clavier et des lecteurs d'écran. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="website">Site web</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <fieldset ref={refs.type as React.RefObject<HTMLFieldSetElement>} tabIndex={-1}>
          <legend className="font-label-md text-label-md text-on-surface-variant mb-3">
            Quel est l&apos;objet de votre demande ?
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CONTACT_TYPE_KEYS.map((key) => (
              <label
                key={key}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  type === key ? 'border-primary bg-primary-fixed/30' : 'border-outline-variant hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={key}
                  checked={type === key}
                  onChange={() => setType(key)}
                  aria-describedby={errors.type ? 'contact-type-error' : undefined}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-[14px] text-on-surface">{CONTACT_TYPES[key].label}</span>
              </label>
            ))}
          </div>
          {errors.type && (
            <p id="contact-type-error" role="alert" aria-live="polite" className="mt-2 text-[13px] text-error">
              {errors.type}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="contact-email" className="font-label-md text-label-md text-on-surface-variant mb-2 block">
            Votre adresse e-mail
          </label>
          <input
            id="contact-email"
            ref={refs.email as React.RefObject<HTMLInputElement>}
            type="email"
            autoComplete="email"
            value={connectedEmail ?? email}
            readOnly={!!connectedEmail}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'contact-email-error' : undefined}
            className={`w-full rounded-lg border px-4 py-3 text-[15px] text-on-surface focus:border-primary focus:outline-none ${
              connectedEmail ? 'border-outline-variant bg-surface-container text-on-surface-variant' : 'border-outline-variant bg-surface-container-lowest'
            } ${errors.email ? 'border-error' : ''}`}
          />
          {errors.email ? (
            <p id="contact-email-error" role="alert" aria-live="polite" className="mt-1.5 text-[13px] text-error">
              {errors.email}
            </p>
          ) : connectedEmail ? (
            <p className="mt-1.5 text-[12.5px] text-on-surface-variant">Adresse de votre compte.</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="contact-subject" className="font-label-md text-label-md text-on-surface-variant mb-2 block">
            Sujet
          </label>
          <input
            id="contact-subject"
            ref={refs.subject as React.RefObject<HTMLInputElement>}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, SUJET_MAX))}
            aria-invalid={!!errors.subject}
            aria-describedby={errors.subject ? 'contact-subject-error' : undefined}
            className={`w-full rounded-lg border bg-surface-container-lowest px-4 py-3 text-[15px] text-on-surface focus:border-primary focus:outline-none ${
              errors.subject ? 'border-error' : 'border-outline-variant'
            }`}
          />
          <div className="mt-1.5 flex items-center justify-between">
            {errors.subject ? (
              <p id="contact-subject-error" role="alert" aria-live="polite" className="text-[13px] text-error">
                {errors.subject}
              </p>
            ) : (
              <span className="text-[12px] text-outline">Au moins {SUJET_MIN} caractères.</span>
            )}
            <span className="text-[12px] text-outline">
              {subject.length}/{SUJET_MAX}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="contact-message" className="font-label-md text-label-md text-on-surface-variant mb-2 block">
            Votre message
          </label>
          <p className="mb-2 text-[12.5px] text-on-surface-variant">
            Merci de ne pas inclure d&apos;informations personnelles ou sensibles dans votre message.
          </p>
          <textarea
            id="contact-message"
            ref={refs.message as React.RefObject<HTMLTextAreaElement>}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            rows={6}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? 'contact-message-error' : undefined}
            className={`w-full resize-none rounded-lg border bg-surface-container-lowest px-4 py-3 text-[14px] text-on-surface focus:border-primary focus:outline-none ${
              errors.message ? 'border-error' : 'border-outline-variant'
            }`}
          />
          <div className="mt-1.5 flex items-center justify-between">
            {errors.message ? (
              <p id="contact-message-error" role="alert" aria-live="polite" className="text-[13px] text-error">
                {errors.message}
              </p>
            ) : (
              <span className="text-[12px] text-outline">Au moins {MESSAGE_MIN} caractères.</span>
            )}
            <span className="text-[12px] text-outline">
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
        </div>

        {generalError && (
          <p role="alert" aria-live="polite" className="rounded-lg bg-error-container px-4 py-3 text-[13px] text-on-error-container">
            {generalError}
          </p>
        )}

        <p className="text-[12px] leading-relaxed text-on-surface-variant">
          Vos informations servent uniquement à traiter votre demande et à y répondre. Elles sont conservées 12 mois
          (24 mois pour un signalement de bug) et hébergées en Europe. Les signalements techniques alimentent notre
          outil de suivi sous une forme anonymisée. Vous pouvez à tout moment demander l&apos;accès à vos données ou
          leur suppression. Détails dans notre{' '}
          <Link href="/confidentialite" className="text-primary underline underline-offset-2">
            politique de confidentialité
          </Link>
          .
        </p>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="rounded-full bg-primary px-8 py-3 font-label-md text-label-md text-on-primary transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            Envoyer ma demande
          </button>
        </div>
      </form>
    </>
  );
}
