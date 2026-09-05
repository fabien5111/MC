import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CONTENEURS,
  CONTENEUR_PUBLIC,
  MIMES_ACCEPTES,
  TAILLE_MAX_OCTETS,
  cheminObjet,
  estDataUrlImage,
  estMimeAccepte,
  estUrlDuConteneur,
  estUrlStockage,
  nouvelleCleObjet,
  USAGES,
  estUsage,
} from '@/lib/storage';
import { cleDepuisUrlCanonique, signer, urlAffichablePrivee, urlCanonique } from '@/lib/storage-data';

// Le corps signé est le contrat avec le serveur Swift : `méthode\nexpiration\n
// chemin`, chemin non encodé commençant par /v1/. Une divergence d'un seul
// octet produit un 401 sans explication — d'où un vecteur fixe, recalculé ici
// indépendamment de l'implémentation.
describe('signature TempURL', () => {
  const CLE = 'cle-de-test';
  const CHEMIN = '/v1/AUTH_projet/jp-photos/recettes/abc.webp';
  const EXPIRE = 1_800_000_000;

  it('signe exactement « méthode\\nexpiration\\nchemin »', () => {
    const attendu = createHmac('sha256', CLE)
      .update(`PUT\n${EXPIRE}\n${CHEMIN}`)
      .digest('hex');
    expect(signer(CLE, 'PUT', EXPIRE, CHEMIN)).toBe(attendu);
  });

  it('rend un condensat sha256 (64 caractères hexadécimaux)', () => {
    expect(signer(CLE, 'GET', EXPIRE, CHEMIN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distingue les méthodes — un jeton de lecture n’autorise pas à écrire', () => {
    expect(signer(CLE, 'GET', EXPIRE, CHEMIN)).not.toBe(signer(CLE, 'PUT', EXPIRE, CHEMIN));
  });

  it('distingue les chemins — un jeton ne vaut que pour son objet', () => {
    const autre = '/v1/AUTH_projet/jp-photos/recettes/def.webp';
    expect(signer(CLE, 'PUT', EXPIRE, autre)).not.toBe(signer(CLE, 'PUT', EXPIRE, CHEMIN));
  });

  it('distingue les clés — le cloisonnement des deux conteneurs en dépend', () => {
    expect(signer('cle-photos', 'PUT', EXPIRE, CHEMIN)).not.toBe(
      signer('cle-contact', 'PUT', EXPIRE, CHEMIN),
    );
  });
});

describe('chemin d’objet', () => {
  it('compose /v1/AUTH_x/conteneur/cle', () => {
    expect(cheminObjet('/v1/AUTH_x', 'photos', 'a/b.webp')).toBe('/v1/AUTH_x/jp-photos/a/b.webp');
  });

  it('tolère une barre finale sur la racine, sans la doubler', () => {
    expect(cheminObjet('/v1/AUTH_x/', 'contact', 'c.jpg')).toBe('/v1/AUTH_x/jp-contact/c.jpg');
  });
});

describe('cloisonnement', () => {
  it('nomme deux conteneurs distincts', () => {
    expect(CONTENEURS.photos).not.toBe(CONTENEURS.contact);
  });

  it('déclare contact non public — les photos de contact sont des données personnelles', () => {
    expect(CONTENEUR_PUBLIC.photos).toBe(true);
    expect(CONTENEUR_PUBLIC.contact).toBe(false);
  });
});

describe('clé d’objet', () => {
  it('range sous le préfixe et porte l’extension du type', () => {
    expect(nouvelleCleObjet('recettes', 'image/webp')).toMatch(/^recettes\/[0-9a-f-]{36}\.webp$/);
    expect(nouvelleCleObjet('contact', 'image/jpeg')).toMatch(/^contact\/[0-9a-f-]{36}\.jpg$/);
  });

  it('ne laisse pas un préfixe hostile s’échapper du conteneur', () => {
    expect(nouvelleCleObjet('../../etc', 'image/png')).toMatch(/^etc\/[0-9a-f-]{36}\.png$/);
  });

  it('ne produit jamais deux fois la même clé', () => {
    const n = 200;
    const cles = new Set(Array.from({ length: n }, () => nouvelleCleObjet('r', 'image/webp')));
    expect(cles.size).toBe(n);
  });
});

describe('types acceptés', () => {
  it('accepte ce que lib/images.ts produit', () => {
    expect(MIMES_ACCEPTES).toContain('image/webp');
    expect(MIMES_ACCEPTES).toContain('image/jpeg');
  });

  it('refuse tout le reste', () => {
    expect(estMimeAccepte('image/svg+xml')).toBe(false);
    expect(estMimeAccepte('text/html')).toBe(false);
    expect(estMimeAccepte('application/pdf')).toBe(false);
  });

  it('borne la taille bien au-dessus d’une photo compressée', () => {
    expect(TAILLE_MAX_OCTETS).toBeGreaterThan(1024 * 1024);
  });
});

// Pendant les lots B2 et B3, une même colonne porte les deux formes. C'est
// aussi ce que les deux validateurs du § 5.2 appelleront à la place de leur
// `startsWith('data:image/')` — dont celui de lib/contact.ts écarte une photo
// non-`data:` SANS erreur, ce qui ferait disparaître une photo migrée en
// silence.
describe('discrimination des deux formes', () => {
  const dataUrl = 'data:image/webp;base64,AAAA';
  const stockage = 'https://s3.pub2.infomaniak.cloud/v1/AUTH_x/jp-photos/a.webp';

  it('reconnaît une URL de stockage', () => {
    expect(estUrlStockage(stockage)).toBe(true);
    expect(estUrlStockage(dataUrl)).toBe(false);
  });

  it('reconnaît une data-URL', () => {
    expect(estDataUrlImage(dataUrl)).toBe(true);
    expect(estDataUrlImage(stockage)).toBe(false);
  });

  it('ne casse pas sur null ni sur une chaîne vide', () => {
    for (const v of [null, undefined, '']) {
      expect(estUrlStockage(v)).toBe(false);
      expect(estDataUrlImage(v)).toBe(false);
    }
  });

  it('refuse le http nu — le stockage est servi en https', () => {
    expect(estUrlStockage('http://exemple.fr/a.webp')).toBe(false);
  });
});

// § 7.5, lot B2 étape 4 : `/api/contact` est le seul point d'écriture ouvert
// à un appelant SANS session — sans ce filtre, un appel direct pourrait
// glisser n'importe quelle URL externe dans `contact_message_photos`, qui se
// chargerait ensuite dans le panneau d'administration au moment de la
// modération.
describe('estUrlDuConteneur', () => {
  it('accepte une URL du bon conteneur et du bon préfixe', () => {
    expect(estUrlDuConteneur('contact', 'contact', 'https://s3.x/v1/AUTH_x/jp-contact/contact/a.jpg')).toBe(true);
  });

  it('refuse une URL pointant vers un AUTRE conteneur', () => {
    expect(estUrlDuConteneur('contact', 'contact', 'https://s3.x/v1/AUTH_x/jp-photos/contact/a.jpg')).toBe(false);
  });

  it('refuse une URL externe quelconque — le vrai risque que ce filtre écarte', () => {
    expect(estUrlDuConteneur('contact', 'contact', 'https://evil.example/pixel.png')).toBe(false);
  });

  it('refuse une data-URL', () => {
    expect(estUrlDuConteneur('contact', 'contact', 'data:image/webp;base64,AAAA')).toBe(false);
  });

  it('refuse une valeur qui n’est pas une chaîne', () => {
    expect(estUrlDuConteneur('contact', 'contact', undefined)).toBe(false);
    expect(estUrlDuConteneur('contact', 'contact', 42)).toBe(false);
  });
});

// Sur `jp-contact` (privé), la valeur stockée en base n'est ni une URL
// publique ni une clé nue : une forme stable qu'on sait re-décomposer pour la
// re-signer à chaque lecture, sans colonne séparée pour la clé (§ 7.5, lot B2
// étape 4).
describe('URL canonique du conteneur privé — écriture puis lecture', () => {
  const ENV = {
    SWIFT_STORAGE_URL: 'https://s3.pub2.infomaniak.cloud/v1/AUTH_test',
    SWIFT_TEMPURL_KEY_CONTACT: 'cle-contact-test',
    SWIFT_TEMPURL_KEY_PHOTOS: 'cle-photos-test',
  };
  const envOriginal = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('urlCanonique compose une URL stable, jamais signée', () => {
    const url = urlCanonique('contact', 'contact/abc.jpg');
    expect(url).toBe('https://s3.pub2.infomaniak.cloud/v1/AUTH_test/jp-contact/contact/abc.jpg');
    expect(url).not.toContain('temp_url_sig');
  });

  it('cleDepuisUrlCanonique est l’inverse exact de urlCanonique', () => {
    const cle = 'contact/abc.jpg';
    expect(cleDepuisUrlCanonique('contact', urlCanonique('contact', cle))).toBe(cle);
  });

  it('cleDepuisUrlCanonique rend null pour une URL d’un autre conteneur', () => {
    expect(cleDepuisUrlCanonique('contact', urlCanonique('photos', 'recettes/abc.jpg'))).toBeNull();
  });

  it('urlAffichablePrivee re-signe une URL canonique stockée en base', () => {
    const canonique = urlCanonique('contact', 'contact/abc.jpg');
    const affichable = urlAffichablePrivee('contact', canonique);
    expect(affichable.startsWith(canonique)).toBe(true);
    expect(affichable).toContain('temp_url_sig');
  });

  it('urlAffichablePrivee rend une data-URL inchangée — ligne pas encore reprise par le B3', () => {
    const dataUrl = 'data:image/webp;base64,AAAA';
    expect(urlAffichablePrivee('contact', dataUrl)).toBe(dataUrl);
  });

  // Verrou sur une découverte payée cher (§ 8) : ce cluster REFUSE la
  // signature préfixée du nom du condensat (`sha256:…`), pourtant la forme
  // documentée par Swift et la plus explicite — 401 systématique, sur les
  // douze combinaisons mesurées. Seule la forme nue passe. Réintroduire le
  // préfixe « pour être explicite » casserait tout dépôt en production sans
  // qu'aucun autre test ne bronche.
  it('signe en clair, sans préfixe de condensat — la forme préfixée est refusée par le cluster', () => {
    const signee = urlAffichablePrivee('contact', urlCanonique('contact', 'contact/abc.jpg'));
    const sig = new URL(signee).searchParams.get('temp_url_sig');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(signee).not.toContain('sha256:');
    expect(signee).not.toContain('sha256%3A');
  });
});

// L'invariant qui compte. `jp-photos` est en lecture publique : y autoriser un
// dépôt anonyme donnerait à n'importe qui un espace d'hébergement gratuit
// servi sous notre domaine. Le seul usage `public` doit viser le conteneur
// privé, dont les objets ne se lisent que par URL signée.
describe('usages déclarés', () => {
  it('n’autorise aucun dépôt anonyme sur le conteneur public', () => {
    for (const [nom, u] of Object.entries(USAGES)) {
      if (u.acces === 'public') expect(u.conteneur, nom).toBe('contact');
    }
  });

  it('réserve le conteneur privé au seul usage contact', () => {
    for (const [nom, u] of Object.entries(USAGES)) {
      if (u.conteneur === 'contact') expect(nom).toBe('contact');
    }
  });

  it('donne à chaque usage un préfixe distinct, pour que l’inventaire reste lisible', () => {
    const prefixes = Object.values(USAGES).map((u) => u.prefixe);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('reconnaît les usages, et rien d’autre', () => {
    expect(estUsage('recette')).toBe(true);
    expect(estUsage('contact')).toBe(true);
    expect(estUsage('toString')).toBe(false);
    expect(estUsage('nimporte')).toBe(false);
    expect(estUsage(null)).toBe(false);
  });
});
