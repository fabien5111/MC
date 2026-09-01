// Tests de la logique pure du module « contact ».
//
// Portée volontairement étroite, même parti pris que `entitlements.test.ts` :
// on ne teste ici que ce dont une erreur serait SILENCIEUSE — la
// pseudonymisation du ticket Jira, le mappage des statuts (dont dépend
// l'envoi d'un e-mail à un membre) et la garde d'idempotence du webhook. Les
// écritures en base et les appels réseau se vérifient ailleurs.
import { describe, expect, it } from 'vitest';
import {
  CONTEXTE_INCONNU,
  DELAI_MINIMUM_MS,
  JIRA_SUMMARY_MAX,
  REPONSE_ADMIN_MAX,
  REPONSE_ADMIN_MIN,
  REPONSE_MEMBRE_MAX,
  REPONSE_MEMBRE_MIN,
  CONTACT_PHOTO_DATA_URL_MAX,
  CONTACT_PHOTOS_MAX,
  CONTACT_STATUS_KEYS,
  CONTACT_TYPE_KEYS,
  cheminOrigineValide,
  composeEmailDeploiement,
  composeNotificationAdmin,
  composeNotificationDeploiement,
  composeNotificationReponseMembre,
  composeReponseAdmin,
  corpsTicketJira,
  dateClotureApres,
  decisionSynchroJira,
  delaiSuffisant,
  emailDeploiementAutorise,
  estPiegeRempli,
  estReference,
  genererReference,
  jiraPeutEcraser,
  mapperStatutJira,
  memeStatutJira,
  parseStatutsSelectionnes,
  parseTypesSelectionnes,
  premierChampEnErreur,
  reduireUserAgent,
  resumeTicketJira,
  tronquer,
  validerDemande,
  validerPhotos,
  validerReponseAdmin,
  validerReponseMembre,
  verdictDelaiOuverture,
  type ConfigStatutsJira,
  type EtatActuelDemande,
  type StatutJira,
} from './contact';

// ─────────────────────────────────────────────────────────────────────────
// Référence
// ─────────────────────────────────────────────────────────────────────────

describe('genererReference', () => {
  it('produit une référence au format attendu', () => {
    expect(genererReference()).toMatch(/^REF-[A-Z2-9]{6}$/);
  });

  it("n'utilise jamais de caractère ambigu (I, O, 0, 1)", () => {
    // 500 tirages × 6 caractères : suffisant pour attraper un alphabet fautif.
    const tirages = Array.from({ length: 500 }, genererReference).join('');
    expect(tirages).not.toMatch(/[IO01]/);
  });

  it('ne se répète pas sur un petit échantillon', () => {
    const refs = new Set(Array.from({ length: 200 }, genererReference));
    expect(refs.size).toBe(200);
  });

  it('reconnaît ses propres références et rejette le reste', () => {
    expect(estReference(genererReference())).toBe(true);
    expect(estReference('REF-A7F3K2')).toBe(true);
    expect(estReference('REF-A7F3K')).toBe(false); // trop court
    expect(estReference('REF-A7F3KI')).toBe(false); // I exclu de l'alphabet
    expect(estReference('A7F3K2')).toBe(false); // préfixe manquant
    expect(estReference(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

const saisieValide = {
  type: 'bug',
  email: 'fabien@exemple.fr',
  subject: 'Les quantités ne se recalculent pas',
  message: "Quand je change le nombre de parts, les quantités restent identiques sur la fiche.",
};

describe('validerDemande', () => {
  it('accepte une saisie complète', () => {
    const r = validerDemande(saisieValide, false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe('fabien@exemple.fr');
  });

  it("n'exige pas d'e-mail d'un membre connecté, et ignore celui qu'il enverrait", () => {
    const r = validerDemande({ ...saisieValide, email: 'usurpation@exemple.fr' }, true);
    expect(r.ok).toBe(true);
    // L'adresse vient du profil côté serveur : celle du navigateur est
    // falsifiable, elle ne doit jamais atteindre la base.
    if (r.ok) expect(r.data.email).toBeNull();
  });

  it("exige l'e-mail d'un visiteur non connecté", () => {
    const r = validerDemande({ ...saisieValide, email: '' }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });

  it('refuse une adresse manifestement invalide', () => {
    const r = validerDemande({ ...saisieValide, email: 'pas-une-adresse' }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });

  it('refuse un type inconnu', () => {
    const r = validerDemande({ ...saisieValide, type: 'facturation' }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.type).toBeTruthy();
  });

  it('borne le sujet et le message', () => {
    const court = validerDemande({ ...saisieValide, subject: 'Bug', message: 'Trop court.' }, false);
    expect(court.ok).toBe(false);
    if (!court.ok) {
      expect(court.errors.subject).toBeTruthy();
      expect(court.errors.message).toBeTruthy();
    }

    const long = validerDemande(
      { ...saisieValide, subject: 'x'.repeat(121), message: 'y'.repeat(4001) },
      false,
    );
    expect(long.ok).toBe(false);
    if (!long.ok) {
      expect(long.errors.subject).toBeTruthy();
      expect(long.errors.message).toBeTruthy();
    }
  });

  it('rogne les espaces avant de mesurer', () => {
    const r = validerDemande({ ...saisieValide, subject: `   ${'a'.repeat(4)}   ` }, false);
    expect(r.ok).toBe(false); // 4 caractères utiles, sous le minimum de 5
  });

  it('désigne le premier champ en erreur dans l’ordre du formulaire', () => {
    const r = validerDemande({ type: 'nimporte', subject: '', message: '' }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(premierChampEnErreur(r.errors)).toBe('type');

    const s = validerDemande({ ...saisieValide, subject: '', message: '' }, false);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(premierChampEnErreur(s.errors)).toBe('subject');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Anti-spam
// ─────────────────────────────────────────────────────────────────────────

describe('anti-spam', () => {
  it('repère un honeypot rempli, espaces exclus', () => {
    expect(estPiegeRempli('https://spam.example')).toBe(true);
    expect(estPiegeRempli('')).toBe(false);
    expect(estPiegeRempli('   ')).toBe(false);
    expect(estPiegeRempli(undefined)).toBe(false);
  });

  it('refuse une soumission trop rapide, accepte au-delà du seuil', () => {
    const maintenant = 1_000_000;
    expect(delaiSuffisant(maintenant - 500, maintenant)).toBe(false);
    expect(delaiSuffisant(maintenant - DELAI_MINIMUM_MS, maintenant)).toBe(true);
  });

  it('refuse un horodatage périmé ou situé dans le futur', () => {
    const maintenant = 100_000_000;
    expect(delaiSuffisant(maintenant - 25 * 3_600_000, maintenant)).toBe(false);
    // Le jeton est émis par le serveur : un horodatage futur est une
    // falsification, pas une dérive d'horloge.
    expect(delaiSuffisant(maintenant + 60_000, maintenant)).toBe(false);
  });
});

describe('verdictDelaiOuverture', () => {
  const maintenant = 100_000_000;

  it('distingue les QUATRE issues, chacune appelant un comportement différent côté route', () => {
    expect(verdictDelaiOuverture(null, maintenant)).toBe('invalide'); // jeton absent/illisible
    expect(verdictDelaiOuverture(maintenant + 1, maintenant)).toBe('invalide'); // horodatage futur : falsification
    expect(verdictDelaiOuverture(maintenant - 500, maintenant)).toBe('premature'); // < 3 s : robot
    expect(verdictDelaiOuverture(maintenant - DELAI_MINIMUM_MS, maintenant)).toBe('ok');
    expect(verdictDelaiOuverture(maintenant - 25 * 3_600_000, maintenant)).toBe('expire'); // onglet oublié : humain plausible
  });
});

describe('cheminOrigineValide', () => {
  it("accepte un chemin interne, avec ou sans requête ni ancre", () => {
    expect(cheminOrigineValide('/recette/tarte-au-citron')).toBe('/recette/tarte-au-citron');
    expect(cheminOrigineValide('/fournee/12?lecture=1')).toBe('/fournee/12?lecture=1');
  });

  it('refuse une URL absolue ou un chemin protocole-relatif', () => {
    // Le champ n'est affiché qu'en texte (back-office, ticket Jira), mais une
    // URL externe y serait trompeuse à lire sans qu'aucun code n'y navigue.
    expect(cheminOrigineValide('https://exemple.fr/hameçonnage')).toBeNull();
    expect(cheminOrigineValide('//exemple.fr/hameçonnage')).toBeNull();
    expect(cheminOrigineValide('javascript:alert(1)')).toBeNull();
  });

  it('refuse une valeur qui ne serait pas une chaîne', () => {
    expect(cheminOrigineValide(undefined)).toBeNull();
    expect(cheminOrigineValide(42)).toBeNull();
  });
});

describe('validerPhotos', () => {
  const dataUrl = (octets: number) => `data:image/jpeg;base64,${'A'.repeat(octets)}`;

  it('accepte des data-URL image valides', () => {
    expect(validerPhotos([dataUrl(100), dataUrl(200)])).toEqual([dataUrl(100), dataUrl(200)]);
  });

  it("écarte silencieusement ce qui n'est pas une data-URL image, sans faire échouer le reste", () => {
    expect(validerPhotos(['pas-une-image', 'https://exemple.fr/x.png', dataUrl(50)])).toEqual([dataUrl(50)]);
  });

  it('borne à CONTACT_PHOTOS_MAX, en gardant les premières', () => {
    const photos = Array.from({ length: CONTACT_PHOTOS_MAX + 2 }, (_, i) => dataUrl(50 + i));
    const resultat = validerPhotos(photos);
    expect(resultat).toHaveLength(CONTACT_PHOTOS_MAX);
    expect(resultat).toEqual(photos.slice(0, CONTACT_PHOTOS_MAX));
  });

  it('écarte une entrée trop lourde plutôt que de la tronquer', () => {
    expect(validerPhotos([dataUrl(CONTACT_PHOTO_DATA_URL_MAX + 1)])).toEqual([]);
  });

  it("renvoie un tableau vide pour une valeur qui n'est pas un tableau", () => {
    expect(validerPhotos(undefined)).toEqual([]);
    expect(validerPhotos('data:image/jpeg;base64,AAAA')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Réduction du user-agent
// ─────────────────────────────────────────────────────────────────────────

describe('reduireUserAgent', () => {
  const cas: [string, string][] = [
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      'Chrome 128 / Android / mobile',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari 17 / iOS / mobile',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
      'Edge 127 / Windows / ordinateur',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:129.0) Gecko/20100101 Firefox/129.0',
      'Firefox 129 / macOS / ordinateur',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
      'Safari 17 / iOS / tablette',
    ],
    [
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Safari/537.36',
      'Samsung Internet 23 / Android / tablette',
    ],
  ];

  for (const [ua, attendu] of cas) {
    it(`réduit « ${attendu} »`, () => {
      expect(reduireUserAgent(ua)).toBe(attendu);
    });
  }

  it('renvoie une constante pour une entrée vide', () => {
    expect(reduireUserAgent(null)).toBe(CONTEXTE_INCONNU);
    expect(reduireUserAgent('')).toBe(CONTEXTE_INCONNU);
    expect(reduireUserAgent('   ')).toBe(CONTEXTE_INCONNU);
  });

  it('ne laisse JAMAIS fuir un fragment du user-agent brut', () => {
    // L'invariant RGPD du module : quand rien n'est reconnu, on renvoie des
    // constantes, jamais une tranche de la chaîne d'origine — laquelle peut
    // porter un identifiant d'appareil ou un nom d'utilisateur.
    const marqueur = 'IDENTIFIANT-APPAREIL-A-NE-PAS-STOCKER';
    const exotique = `RobotMaison/3.2 (${marqueur}; interne)`;
    const reduit = reduireUserAgent(exotique);
    expect(reduit).not.toContain(marqueur);
    expect(reduit).toBe('Navigateur inconnu / Système inconnu / ordinateur');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Contenu du ticket Jira
// ─────────────────────────────────────────────────────────────────────────

describe('corpsTicketJira', () => {
  it('compose exactement le corps attendu, et rien de plus', () => {
    // Égalité stricte volontaire : ajouter un champ au ticket doit être un
    // geste délibéré qui casse ce test, jamais un effet de bord. C'est la
    // garde du critère « le ticket ne contient ni e-mail, ni nom, ni IP ».
    expect(
      corpsTicketJira({
        reference: 'REF-A7F3K2',
        message: 'Les quantités ne se recalculent pas.',
        userId: '8f14e45f-ceea-467a-9f5c-3b2a1d7e4c09',
        pageUrl: '/recette/tarte-au-citron',
        browserContext: 'Chrome 128 / Android / mobile',
        appVersion: 'a1b2c3d',
        photoAdminUrl: null,
      }),
    ).toBe(
      [
        'Signalement utilisateur — REF-A7F3K2',
        '',
        'Les quantités ne se recalculent pas.',
        '',
        '---',
        'Membre : 8f14e45f-ceea-467a-9f5c-3b2a1d7e4c09',
        'Page : /recette/tarte-au-citron',
        'Contexte : Chrome 128 / Android / mobile',
        'Version : a1b2c3d',
        "Coordonnées du demandeur : écran d'administration, référence REF-A7F3K2.",
      ].join('\n'),
    );
  });

  it('désigne un visiteur non connecté sans inventer de valeur', () => {
    const corps = corpsTicketJira({
      reference: 'REF-B2C3D4',
      message: 'Bonjour',
      userId: null,
      pageUrl: null,
      browserContext: null,
      appVersion: null,
      photoAdminUrl: null,
    });
    expect(corps).toContain('Membre : visiteur non connecté');
    expect(corps).toContain('Page : non renseignée');
    expect(corps).toContain(`Contexte : ${CONTEXTE_INCONNU}`);
  });

  it('préserve les paragraphes du message', () => {
    const corps = corpsTicketJira({
      reference: 'REF-B2C3D4',
      message: 'Premier paragraphe.\n\nSecond paragraphe.',
      userId: null,
      pageUrl: null,
      browserContext: null,
      appVersion: null,
      photoAdminUrl: null,
    });
    expect(corps).toContain('Premier paragraphe.\n\nSecond paragraphe.');
  });

  it("ajoute la ligne de la photo UNIQUEMENT quand photoAdminUrl est renseignée, sans jamais y faire figurer autre chose qu'un lien", () => {
    const sansPhoto = corpsTicketJira({
      reference: 'REF-B2C3D4',
      message: 'Bonjour',
      userId: null,
      pageUrl: null,
      browserContext: null,
      appVersion: null,
      photoAdminUrl: null,
    });
    expect(sansPhoto).not.toContain('Photo jointe');

    const avecPhoto = corpsTicketJira({
      reference: 'REF-B2C3D4',
      message: 'Bonjour',
      userId: null,
      pageUrl: null,
      browserContext: null,
      appVersion: null,
      photoAdminUrl: 'https://jepatisse.com/admin/contact/REF-B2C3D4',
    });
    expect(avecPhoto).toContain("Photo jointe — à consulter dans l'administration : https://jepatisse.com/admin/contact/REF-B2C3D4");
  });
});

describe('resumeTicketJira', () => {
  it('préfixe le sujet', () => {
    expect(resumeTicketJira('Les quantités ne se recalculent pas')).toBe(
      '[Signalement] Les quantités ne se recalculent pas',
    );
  });

  it('respecte le plafond Jira de 255 caractères', () => {
    const resume = resumeTicketJira('x'.repeat(400));
    expect(resume.length).toBeLessThanOrEqual(JIRA_SUMMARY_MAX);
    expect(resume.endsWith('…')).toBe(true);
  });
});

describe('tronquer', () => {
  it('ne touche pas à un texte assez court', () => {
    expect(tronquer('court', 10)).toBe('court');
  });
  it('coupe et marque la troncature', () => {
    expect(tronquer('abcdefghij', 5)).toBe('abcd…');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Mappage des statuts Jira
// ─────────────────────────────────────────────────────────────────────────

const config: ConfigStatutsJira = {
  aDeployerId: '10002',
  aDeployerNom: 'Terminé',
  deployeId: '10005',
  deployeNom: 'Déployé',
};

const statut = (over: Partial<StatutJira>): StatutJira => ({
  id: null,
  nom: 'Terminé',
  categorie: 'done',
  ...over,
});

describe('mapperStatutJira', () => {
  it('laisse la demande intacte tant que le ticket est « à faire »', () => {
    const r = mapperStatutJira(statut({ nom: 'À faire', categorie: 'new' }), config);
    expect(r.action).toBe('ignorer');
  });

  it('passe en cours sur la catégorie « en cours »', () => {
    const r = mapperStatutJira(statut({ nom: 'En cours', categorie: 'indeterminate' }), config);
    expect(r).toMatchObject({ action: 'appliquer', statut: 'en_cours', clore: false, notifier: false });
  });

  it('met « à déployer » sur Terminé, sans clore ni notifier', () => {
    const r = mapperStatutJira(statut({ id: '10002', nom: 'Terminé' }), config);
    expect(r).toMatchObject({ action: 'appliquer', statut: 'a_deployer', clore: false, notifier: false });
  });

  it('clôt et notifie sur Déployé', () => {
    const r = mapperStatutJira(statut({ id: '10005', nom: 'Déployé' }), config);
    expect(r).toMatchObject({ action: 'appliquer', statut: 'termine', clore: true, notifier: true });
  });

  it("reconnaît un statut renommé grâce à son id — c'est tout l'intérêt de l'id", () => {
    const r = mapperStatutJira(statut({ id: '10005', nom: 'Mis en ligne' }), config);
    expect(r).toMatchObject({ statut: 'termine', notifier: true });
  });

  it("reconnaît par le nom quand aucun id n'est configuré", () => {
    const sansId: ConfigStatutsJira = { ...config, aDeployerId: null, deployeId: null };
    const r = mapperStatutJira(statut({ id: '99999', nom: 'déployé  ' }), sansId);
    expect(r).toMatchObject({ statut: 'termine', notifier: true });
  });

  it('bloque en « à déployer » un statut terminal inconnu, avec avertissement et sans e-mail', () => {
    const r = mapperStatutJira(statut({ id: '10099', nom: 'Livré en production' }), config);
    expect(r).toMatchObject({ action: 'appliquer', statut: 'a_deployer', clore: false, notifier: false });
    expect(r.avertissement).toContain('Livré en production');
  });

  it('ne notifie jamais quand les deux variables désignent le même statut', () => {
    const ambigu: ConfigStatutsJira = {
      aDeployerId: null,
      aDeployerNom: 'Terminé',
      deployeId: null,
      deployeNom: 'Terminé',
    };
    const r = mapperStatutJira(statut({ nom: 'Terminé' }), ambigu);
    expect(r).toMatchObject({ statut: 'a_deployer', notifier: false });
    expect(r.avertissement).toContain('ambiguë');
  });

  it('ignore une catégorie inconnue en le signalant', () => {
    const r = mapperStatutJira(statut({ nom: 'En attente client', categorie: 'undefined' }), config);
    expect(r.action).toBe('ignorer');
    expect(r.avertissement).toContain('En attente client');
  });

  it("fait primer le nom sur la catégorie quand les deux se contredisent", () => {
    // Statut nommé « Déployé » mais rangé en catégorie « en cours » : c'est la
    // configuration Jira qui est fautive, le nom reste la référence (§9.1).
    const r = mapperStatutJira(statut({ id: null, nom: 'Déployé', categorie: 'indeterminate' }), {
      ...config,
      deployeId: null,
    });
    expect(r).toMatchObject({ statut: 'termine', notifier: true });
  });
});

describe('memeStatutJira', () => {
  it('reconnaît un événement sans changement de statut, par id', () => {
    expect(memeStatutJira({ id: '10005', nom: 'Déployé' }, statut({ id: '10005', nom: 'Déployé' }))).toBe(true);
  });

  it('détecte un changement de statut', () => {
    expect(memeStatutJira({ id: '10002', nom: 'Terminé' }, statut({ id: '10005', nom: 'Déployé' }))).toBe(false);
  });

  it("retombe sur le nom quand un id manque, en ignorant casse et espaces", () => {
    expect(memeStatutJira({ id: null, nom: 'Déployé' }, statut({ id: null, nom: '  déployé ' }))).toBe(true);
    expect(memeStatutJira({ id: null, nom: 'Terminé' }, statut({ id: null, nom: 'Déployé' }))).toBe(false);
  });

  it('considère une demande jamais synchronisée comme différente', () => {
    expect(memeStatutJira({ id: null, nom: null }, statut({ id: '10005', nom: 'Déployé' }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// decisionSynchroJira — point d'entrée unique du webhook et de la
// réconciliation
// ─────────────────────────────────────────────────────────────────────────

describe('decisionSynchroJira', () => {
  const etat = (over: Partial<EtatActuelDemande> = {}): EtatActuelDemande => ({
    status: 'en_cours',
    statusSource: 'jira-webhook',
    jiraStatusId: '10002',
    jiraStatus: 'Terminé',
    ...over,
  });

  it('ignore un événement sans changement de statut Jira (le cas le plus fréquent)', () => {
    const d = decisionSynchroJira(etat(), statut({ id: '10002', nom: 'Terminé' }), config);
    expect(d).toEqual({ action: 'ignorer', raison: 'meme_statut', avertissement: null });
  });

  it('applique le passage en À déployer puis en Terminé, dans cet ordre', () => {
    const versADeployer = decisionSynchroJira(
      etat({ jiraStatusId: null, jiraStatus: null, status: 'recu' }),
      statut({ id: '10002', nom: 'Terminé' }),
      config,
    );
    expect(versADeployer).toMatchObject({ action: 'appliquer', statut: 'a_deployer', notifier: false });

    const versTermine = decisionSynchroJira(etat(), statut({ id: '10005', nom: 'Déployé' }), config);
    expect(versTermine).toMatchObject({ action: 'appliquer', statut: 'termine', clore: true, notifier: true });
  });

  it("ne rétrograde jamais une clôture manuelle de l'administrateur", () => {
    // Le ticket Jira a été rouvert puis repasse par « Terminé » : sans la
    // garde, ça écraserait un `termine` posé à la main.
    const d = decisionSynchroJira(
      etat({ status: 'termine', statusSource: 'admin', jiraStatusId: '10005', jiraStatus: 'Déployé' }),
      statut({ id: '10002', nom: 'Terminé' }),
      config,
    );
    expect(d).toEqual({ action: 'ignorer', raison: 'mappage', avertissement: null });
  });

  it("laisse Jira mettre à jour une clôture qu'il a lui-même prononcée", () => {
    // Même statut final (`termine`), mais posé par le webhook — rouvrir puis
    // redéployer doit rester synchronisable.
    const d = decisionSynchroJira(
      etat({ status: 'termine', statusSource: 'jira-webhook', jiraStatusId: '10005', jiraStatus: 'Déployé' }),
      statut({ id: '10002', nom: 'Terminé' }),
      config,
    );
    expect(d).toMatchObject({ action: 'appliquer', statut: 'a_deployer' });
  });

  it('transmet l’avertissement d’un statut terminal inconnu, sans notifier', () => {
    const d = decisionSynchroJira(etat({ jiraStatusId: '1', jiraStatus: 'Ancien' }), statut({ id: '10099', nom: 'Livré' }), config);
    expect(d).toMatchObject({ action: 'appliquer', statut: 'a_deployer', notifier: false });
    expect(d.avertissement).toContain('Livré');
  });

  it('ignore silencieusement un ticket encore « à faire »', () => {
    const d = decisionSynchroJira(etat({ jiraStatusId: null, jiraStatus: null }), statut({ nom: 'À faire', categorie: 'new' }), config);
    expect(d).toEqual({ action: 'ignorer', raison: 'mappage', avertissement: null });
  });

  it("vérifie l'idempotence AVANT la protection admin — l'ordre documenté compte", () => {
    // Un événement qui ne change rien doit rester inoffensif même sur une
    // demande close manuellement : la garde d'idempotence doit répondre la
    // première, avant même de consulter `jiraPeutEcraser`.
    const d = decisionSynchroJira(
      etat({ status: 'termine', statusSource: 'admin', jiraStatusId: '10005', jiraStatus: 'Déployé' }),
      statut({ id: '10005', nom: 'Déployé' }),
      config,
    );
    expect(d).toEqual({ action: 'ignorer', raison: 'meme_statut', avertissement: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Règles de statut
// ─────────────────────────────────────────────────────────────────────────

describe('jiraPeutEcraser', () => {
  it("protège une clôture prononcée par l'administrateur", () => {
    expect(jiraPeutEcraser('termine', 'admin')).toBe(false);
  });

  it('laisse Jira mettre à jour tout le reste', () => {
    expect(jiraPeutEcraser('termine', 'jira-webhook')).toBe(true);
    expect(jiraPeutEcraser('a_deployer', 'admin')).toBe(true);
    expect(jiraPeutEcraser('recu', null)).toBe(true);
  });
});

describe('dateClotureApres', () => {
  const t = '2026-08-30T14:32:00.000Z';
  it('renseigne la date en entrant dans « terminé »', () => {
    expect(dateClotureApres('termine', t)).toBe(t);
  });
  it("l'efface au retour en arrière — une demande rouverte n'est plus close", () => {
    expect(dateClotureApres('a_deployer', t)).toBeNull();
    expect(dateClotureApres('recu', t)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// E-mail de déploiement
// ─────────────────────────────────────────────────────────────────────────

const conditionsOk = {
  type: 'bug',
  email: 'fabien@exemple.fr',
  deployNotify: true,
  statutEmail: 'pending',
  source: 'jira-webhook',
} as const;

describe('emailDeploiementAutorise', () => {
  it('autorise le cas nominal', () => {
    expect(emailDeploiementAutorise(conditionsOk)).toEqual({ envoyer: true });
  });

  it("n'envoie rien sur une clôture manuelle", () => {
    const r = emailDeploiementAutorise({ ...conditionsOk, source: 'admin' });
    expect(r.envoyer).toBe(false);
    if (!r.envoyer) expect(r.raison).toContain('manuelle');
  });

  it('accepte aussi la réconciliation quotidienne', () => {
    expect(emailDeploiementAutorise({ ...conditionsOk, source: 'jira-sync' })).toEqual({ envoyer: true });
  });

  it('ne notifie que les signalements de bug', () => {
    expect(emailDeploiementAutorise({ ...conditionsOk, type: 'suggestion' }).envoyer).toBe(false);
  });

  it('ignore une demande sans adresse', () => {
    expect(emailDeploiementAutorise({ ...conditionsOk, email: null }).envoyer).toBe(false);
  });

  it("respecte l'interrupteur de la demande", () => {
    expect(emailDeploiementAutorise({ ...conditionsOk, deployNotify: false }).envoyer).toBe(false);
  });

  it("n'envoie jamais deux fois : « sent » est terminal", () => {
    const r = emailDeploiementAutorise({ ...conditionsOk, statutEmail: 'sent' });
    expect(r.envoyer).toBe(false);
    if (!r.envoyer) expect(r.raison).toContain('sent');
    expect(emailDeploiementAutorise({ ...conditionsOk, statutEmail: 'failed' }).envoyer).toBe(false);
    expect(emailDeploiementAutorise({ ...conditionsOk, statutEmail: 'skipped' }).envoyer).toBe(false);
  });

  it('donne toujours une raison exploitable quand il refuse', () => {
    const r = emailDeploiementAutorise({ ...conditionsOk, type: 'question' });
    expect(r.envoyer).toBe(false);
    if (!r.envoyer) expect(r.raison.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Notification à l'administrateur
// ─────────────────────────────────────────────────────────────────────────

describe('composeNotificationAdmin', () => {
  const ctxBase = {
    reference: 'REF-A7F3K2',
    type: 'bug' as const,
    subject: 'Les quantités ne se recalculent pas',
    message: 'Le détail du problème.',
    authorLabel: 'Fabien D.',
    authorEmail: 'fabien@exemple.fr',
    createdAtIso: '2026-08-30T14:32:00.000Z',
    pageUrl: '/recettes/tarte-au-citron',
    browserContext: 'Chrome 128 / Android / mobile',
    jiraIssueKey: null,
    adminUrl: 'https://jepatisse.com/admin/contact/REF-A7F3K2',
  };

  it('compose un objet portant le type et la référence', () => {
    const { subject } = composeNotificationAdmin(ctxBase);
    expect(subject).toContain('Bug');
    expect(subject).toContain('REF-A7F3K2');
  });

  it('marque une demande de type données personnelles comme prioritaire', () => {
    const { subject, text } = composeNotificationAdmin({ ...ctxBase, type: 'donnees-personnelles' });
    expect(subject).toContain('PRIORITAIRE');
    expect(text).toContain("délai de réponse légal d'un mois");
  });

  it("n'ajoute la ligne du ticket Jira que si elle existe", () => {
    expect(composeNotificationAdmin(ctxBase).text).not.toContain('Ticket Jira');
    expect(composeNotificationAdmin({ ...ctxBase, jiraIssueKey: 'JEP-142' }).text).toContain('Ticket Jira : JEP-142');
  });

  it("désigne un visiteur sans reformuler artificiellement son adresse", () => {
    const text = composeNotificationAdmin({ ...ctxBase, authorLabel: 'Visiteur', authorEmail: null }).text;
    expect(text).toContain('Membre : Visiteur');
    expect(text).not.toContain('Membre : Visiteur (');
  });

  it("reprend le lien vers l'administration", () => {
    expect(composeNotificationAdmin(ctxBase).text).toContain(ctxBase.adminUrl);
  });

  it('échappe le HTML du message dans la version HTML', () => {
    const html = composeNotificationAdmin({ ...ctxBase, message: '<script>alert(1)</script>' }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Réponse depuis l'administration
// ─────────────────────────────────────────────────────────────────────────

describe('validerReponseAdmin', () => {
  it('accepte une réponse de longueur valide', () => {
    const r = validerReponseAdmin('Merci pour votre signalement, nous regardons cela.');
    expect(r.ok).toBe(true);
  });

  it('rogne les espaces avant de mesurer', () => {
    const r = validerReponseAdmin(`   ${'a'.repeat(5)}   `);
    expect(r.ok).toBe(false); // 5 caractères utiles, sous le minimum de 10
  });

  it('refuse en dessous du minimum et au-dessus du maximum', () => {
    expect(validerReponseAdmin('trop court').ok).toBe(true); // exactement 10
    expect(validerReponseAdmin('trop cour').ok).toBe(false); // 9
    expect(validerReponseAdmin('x'.repeat(REPONSE_ADMIN_MAX)).ok).toBe(true);
    expect(validerReponseAdmin('x'.repeat(REPONSE_ADMIN_MAX + 1)).ok).toBe(false);
  });

  it("refuse une valeur qui n'est pas une chaîne", () => {
    expect(validerReponseAdmin(undefined).ok).toBe(false);
    expect(validerReponseAdmin(42).ok).toBe(false);
  });

  it('rend REPONSE_ADMIN_MIN cohérent avec la borne réellement appliquée', () => {
    expect(validerReponseAdmin('a'.repeat(REPONSE_ADMIN_MIN)).ok).toBe(true);
    expect(validerReponseAdmin('a'.repeat(REPONSE_ADMIN_MIN - 1)).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Réponse du demandeur depuis son propre suivi (lot 9)
// ─────────────────────────────────────────────────────────────────────────

describe('validerReponseMembre', () => {
  it('accepte un message court, plus permissif que côté admin', () => {
    expect(validerReponseMembre('Toujours pareil').ok).toBe(true);
    expect(REPONSE_MEMBRE_MIN).toBeLessThan(REPONSE_ADMIN_MIN);
  });

  it('rogne les espaces avant de mesurer', () => {
    expect(validerReponseMembre(`   ${'a'.repeat(REPONSE_MEMBRE_MIN - 1)}   `).ok).toBe(false);
  });

  it('refuse en dessous du minimum et au-dessus du maximum', () => {
    expect(validerReponseMembre('a'.repeat(REPONSE_MEMBRE_MIN)).ok).toBe(true);
    expect(validerReponseMembre('a'.repeat(REPONSE_MEMBRE_MIN - 1)).ok).toBe(false);
    expect(validerReponseMembre('x'.repeat(REPONSE_MEMBRE_MAX)).ok).toBe(true);
    expect(validerReponseMembre('x'.repeat(REPONSE_MEMBRE_MAX + 1)).ok).toBe(false);
  });

  it("refuse une valeur qui n'est pas une chaîne", () => {
    expect(validerReponseMembre(undefined).ok).toBe(false);
    expect(validerReponseMembre(42).ok).toBe(false);
  });
});

describe('composeNotificationReponseMembre', () => {
  const ctx = {
    reference: 'REF-A7F3K2',
    subject: 'Les quantités ne se recalculent pas',
    body: 'Toujours le même souci, même après la mise à jour.',
    adminUrl: 'https://jepatisse.com/admin/contact/REF-A7F3K2',
  };

  it('porte la référence dans l’objet', () => {
    expect(composeNotificationReponseMembre(ctx).subject).toContain('REF-A7F3K2');
  });

  it('reprend le corps du message et le lien vers l’administration', () => {
    const { text } = composeNotificationReponseMembre(ctx);
    expect(text).toContain(ctx.body);
    expect(text).toContain(ctx.adminUrl);
  });

  it('échappe le HTML du message dans la version HTML', () => {
    const html = composeNotificationReponseMembre({ ...ctx, body: '<script>alert(1)</script>' }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('composeReponseAdmin', () => {
  const ctx = {
    reference: 'REF-A7F3K2',
    authorFirstName: 'Fabien',
    replyBody: 'Le correctif est en cours de développement.',
    originalSubject: 'Les quantités ne se recalculent pas',
    originalMessage: 'Les quantités ne se recalculent pas quand je change le nombre de parts.',
    originalDateIso: '2026-08-30T14:32:00.000Z',
  };

  it("porte la référence dans l'objet, préfixé « Re : »", () => {
    const { subject } = composeReponseAdmin(ctx);
    expect(subject).toBe('Re : Les quantités ne se recalculent pas [REF-A7F3K2]');
  });

  it('salue par le prénom quand il est connu, génériquement sinon', () => {
    expect(composeReponseAdmin(ctx).text).toContain('Bonjour Fabien,');
    expect(composeReponseAdmin({ ...ctx, authorFirstName: null }).text).toContain('Bonjour,');
  });

  it('rappelle le message initial en citation, tronquée', () => {
    const long = { ...ctx, originalMessage: 'x'.repeat(600) };
    const { text } = composeReponseAdmin(long);
    expect(text).toContain('Votre message initial du');
    expect(text).toContain('x'.repeat(499) + '…');
    expect(text).not.toContain('x'.repeat(501));
  });

  it("échappe le HTML de la réponse de l'administrateur", () => {
    const html = composeReponseAdmin({ ...ctx, replyBody: '<img src=x onerror=alert(1)>' }).html;
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// E-mail et notification de déploiement
// ─────────────────────────────────────────────────────────────────────────

describe('composeEmailDeploiement', () => {
  it('porte la référence dans l’objet et le sujet original entre guillemets', () => {
    const { subject, text } = composeEmailDeploiement({
      reference: 'REF-A7F3K2',
      authorFirstName: 'Fabien',
      subject: 'Les quantités ne se recalculent pas',
    });
    expect(subject).toBe('Le problème que vous avez signalé est corrigé [REF-A7F3K2]');
    expect(text).toContain('« Les quantités ne se recalculent pas »');
  });

  it('salue par le prénom quand il est connu, génériquement sinon', () => {
    const ctx = { reference: 'REF-A7F3K2', authorFirstName: null, subject: 'Bug' };
    expect(composeEmailDeploiement({ ...ctx, authorFirstName: 'Fabien' }).text).toContain('Bonjour Fabien,');
    expect(composeEmailDeploiement(ctx).text).toContain('Bonjour,');
  });

  it('échappe le sujet dans la version HTML', () => {
    const html = composeEmailDeploiement({
      reference: 'REF-A7F3K2',
      authorFirstName: null,
      subject: '<script>alert(1)</script>',
    }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('composeNotificationDeploiement', () => {
  it('reprend le sujet dans le corps de la notification', () => {
    const { title, body } = composeNotificationDeploiement('Les quantités ne se recalculent pas');
    expect(title).toBeTruthy();
    expect(body).toContain('Les quantités ne se recalculent pas');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Filtres statut/type de la liste d'administration
// ─────────────────────────────────────────────────────────────────────────

describe('parseStatutsSelectionnes', () => {
  it('coche tout par défaut quand le paramètre est absent', () => {
    expect(parseStatutsSelectionnes(undefined)).toEqual(CONTACT_STATUS_KEYS);
  });

  it("distingue l'absence (tout) d'une sélection explicitement vide (rien)", () => {
    expect(parseStatutsSelectionnes('')).toEqual([]);
  });

  it('lit une liste de valeurs séparées par des virgules', () => {
    expect(parseStatutsSelectionnes('recu,termine')).toEqual(['recu', 'termine']);
  });

  it('ignore silencieusement une valeur invalide plutôt que de faire échouer tout le filtre', () => {
    expect(parseStatutsSelectionnes('recu,pas-un-statut,termine')).toEqual(['recu', 'termine']);
  });
});

describe('parseTypesSelectionnes', () => {
  it('coche tout par défaut quand le paramètre est absent', () => {
    expect(parseTypesSelectionnes(undefined)).toEqual(CONTACT_TYPE_KEYS);
  });

  it("distingue l'absence (tout) d'une sélection explicitement vide (rien)", () => {
    expect(parseTypesSelectionnes('')).toEqual([]);
  });

  it('lit une liste de valeurs séparées par des virgules', () => {
    expect(parseTypesSelectionnes('bug,question')).toEqual(['bug', 'question']);
  });

  it('ignore silencieusement une valeur invalide', () => {
    expect(parseTypesSelectionnes('bug,pas-un-type')).toEqual(['bug']);
  });
});
