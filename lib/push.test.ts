// Tests des notifications sur l'appareil (Web Push) : la liste blanche est ce
// qui empêche le serveur d'appeler une adresse arbitraire fournie par un
// navigateur (SSRF) — une régression ici est une faille, pas un bug d'affichage.
import { describe, expect, it } from 'vitest';
import { cleVapidVersOctets, composerMessagePush, endpointPushAutorise, lienPushSur, lireAbonnementPush } from '@/lib/push';

const P256DH = 'B' + 'A'.repeat(86);
const AUTH = 'abcdefghijklmnopqrstuv';

describe('endpointPushAutorise', () => {
  it('accepte les services de push des navigateurs', () => {
    expect(endpointPushAutorise('https://fcm.googleapis.com/fcm/send/abc:def')).toBe(true);
    expect(endpointPushAutorise('https://updates.push.services.mozilla.com/wpush/v2/xyz')).toBe(true);
    expect(endpointPushAutorise('https://web.push.apple.com/QGx')).toBe(true);
    expect(endpointPushAutorise('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
  });
  it('refuse tout le reste', () => {
    expect(endpointPushAutorise('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(endpointPushAutorise('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false);
    expect(endpointPushAutorise('https://evilfcm.googleapis.com.attaquant.fr/x')).toBe(false);
    expect(endpointPushAutorise('https://fcm.googleapis.com.attaquant.fr/x')).toBe(false);
    expect(endpointPushAutorise('https://attaquant.fr/fcm.googleapis.com')).toBe(false);
    expect(endpointPushAutorise('https://user:mdp@fcm.googleapis.com/x')).toBe(false);
    expect(endpointPushAutorise('https://10.0.0.5/x')).toBe(false);
    expect(endpointPushAutorise('pas une adresse')).toBe(false);
  });
});

describe('lireAbonnementPush', () => {
  const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: P256DH, auth: AUTH } };
  it('lit un abonnement de navigateur', () => {
    expect(lireAbonnementPush(ok)).toEqual({ endpoint: ok.endpoint, p256dh: P256DH, auth: AUTH });
  });
  it('rejette un service non autorisé ou des clés invalides', () => {
    expect(lireAbonnementPush({ ...ok, endpoint: 'https://attaquant.fr/x' })).toBeNull();
    expect(lireAbonnementPush({ ...ok, keys: { p256dh: 'court', auth: AUTH } })).toBeNull();
    expect(lireAbonnementPush({ ...ok, keys: { p256dh: P256DH, auth: 'pas/base64url!!!!!!!' } })).toBeNull();
    expect(lireAbonnementPush(null)).toBeNull();
    expect(lireAbonnementPush('texte')).toBeNull();
  });
});

describe('message', () => {
  it('ne mène jamais hors du site', () => {
    expect(lienPushSur('/recette/12')).toBe('/recette/12');
    expect(lienPushSur('//attaquant.fr')).toBe('/notifications');
    expect(lienPushSur('/\\attaquant.fr')).toBe('/notifications');
    expect(lienPushSur('https://attaquant.fr')).toBe('/notifications');
    expect(lienPushSur(null)).toBe('/notifications');
  });
  it('tronque un texte trop long et garde un titre', () => {
    const m = composerMessagePush('  ', 'x'.repeat(1000), '/reglages');
    expect(m.titre).toBe('Je pâtisse !');
    expect(m.corps.length).toBe(300);
    expect(m.corps.endsWith('…')).toBe(true);
  });
});

describe('cleVapidVersOctets', () => {
  it('décode le base64url sans remplissage', () => {
    expect(Array.from(cleVapidVersOctets('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });
});
