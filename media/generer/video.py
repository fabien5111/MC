"""Intro et outro des vidéos « Je pâtisse ! », formats 16:9 et 9:16.

Tout est calculé image par image (numpy + OpenCV), puis encodé par ffmpeg avec
le jingle de `musique.py` — aucun outil de montage, aucun élément extérieur
hormis la bannière du site (`media/sources/banniere.webp`) et les polices du
site (`app/fonts/*.woff2`).

- Intro : la bannière apparaît, « Je pâtisse ! » s'écrit, le « ! » tombe sur
  l'accord final de la musique (t = 4,0 s).
- Outro : « Retrouvez-nous sur… » s'écrit, puis l'adresse du site, soulignée
  sur l'accord final, et fondu de sortie.

Le titre d'origine est effacé de la bannière (inpainting OpenCV), et sa forme
exacte est extraite en masque : c'est ce masque qui « s'écrit » dans l'intro,
de sorte que l'image finale est la bannière, au pixel près.

Usage : python3 video.py [dossier_de_sortie]
Dépendances : numpy scipy opencv-python-headless fonttools brotli pillow, ffmpeg.
"""
import io
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, '..', '..'))
FPS = 30
HIT = 4.0  # accord final de la musique

ROSE = np.array([251, 230, 232], float)       # papier de la bannière (fondus)
ENCRE = np.array([61, 56, 65], float)         # couleur du titre d'origine
BORDEAUX = np.array([122, 53, 64], float)     # adresse du site
ETINCELLE = np.array([255, 250, 240], float)
OR = np.array([232, 176, 98], float)          # halo doré des étincelles

rng = np.random.default_rng(3)


# ---------------------------------------------------------------- utilitaires

def ease_out(x):
    x = np.clip(x, 0, 1)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def ease_out_back(x, k=1.7):
    x = np.clip(x, 0, 1) - 1
    return 1 + (k + 1) * x ** 3 + k * x ** 2


def police(nom, taille, graisse=None):
    """Charge une police du site (.woff2 → TTF en mémoire)."""
    f = TTFont(os.path.join(RACINE, 'app', 'fonts', f'{nom}-latin.woff2'))
    f.flavor = None
    buf = io.BytesIO(); f.save(buf); buf.seek(0)
    fnt = ImageFont.truetype(buf, taille)
    if graisse is not None:
        fnt.set_variation_by_axes([graisse])
    return fnt


def masque_texte(texte, fnt):
    """Texte → masque alpha float (rogné au plus juste, marge de 8 px)."""
    l, t, r, b = fnt.getbbox(texte)
    im = Image.new('L', (r - l + 16, b - t + 16), 0)
    ImageDraw.Draw(im).text((8 - l, 8 - t), texte, font=fnt, fill=255)
    return np.asarray(im, float) / 255


def poser(cadre, alpha, couleur, x, y, opacite=1.0):
    """Fusionne un masque alpha de couleur unie en (x, y) — coin haut-gauche."""
    h, w = alpha.shape
    H, W = cadre.shape[:2]
    x, y = int(round(x)), int(round(y))
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    a = alpha[y0 - y:y1 - y, x0 - x:x1 - x, None] * opacite
    cadre[y0:y1, x0:x1] = cadre[y0:y1, x0:x1] * (1 - a) + couleur * a


def poser_image(cadre, img, alpha, x, y):
    """Fusionne une image (avec son masque alpha) en (x, y), rognée au cadre."""
    h, w = alpha.shape
    H, W = cadre.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    a = alpha[y0 - y:y1 - y, x0 - x:x1 - x, None]
    cadre[y0:y1, x0:x1] = cadre[y0:y1, x0:x1] * (1 - a) + img[y0 - y:y1 - y, x0 - x:x1 - x] * a


def redim(img, s):
    h, w = img.shape[:2]
    return cv2.resize(img, (max(1, round(w * s)), max(1, round(h * s))), interpolation=cv2.INTER_LANCZOS4)


def bord_doux(h, w, marge):
    """Masque rectangulaire aux bords adoucis."""
    yy = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]
    xx = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
    return np.clip(np.minimum(yy, xx) / marge, 0, 1) ** 1.5


# ------------------------------------------------------------- écriture « main »

class Ecriture:
    """Révèle un masque de gauche à droite, comme une plume : front incliné
    (écriture penchée), bord doux, lueur au bout de la plume."""

    def __init__(self, alpha, t0, t1, doux=14, pente=0.28):
        self.alpha, self.t0, self.t1 = alpha, t0, t1
        h, w = alpha.shape
        yy, xx = np.mgrid[0:h, 0:w]
        self.X = xx + pente * (yy - h / 2)
        self.doux = doux
        cols = alpha.sum(0)
        xs = np.where(cols > 0.3)[0]
        self.xa, self.xb = xs.min() - pente * h / 2, xs.max() + pente * h / 2 + doux
        # hauteur de la plume : barycentre vertical de chaque colonne, lissé
        cy = (alpha * yy).sum(0) / np.maximum(cols, 1e-6)
        cy[cols < 0.3] = np.nan
        idx = np.arange(w)
        ok = ~np.isnan(cy)
        cy = np.interp(idx, idx[ok], cy[ok])
        self.cy = np.convolve(cy, np.ones(25) / 25, mode='same')

    def front(self, t):
        u = ease_in_out((t - self.t0) / (self.t1 - self.t0))
        return self.xa + (self.xb - self.xa) * u

    def masque(self, t):
        if t <= self.t0:
            return None
        if t >= self.t1:
            return self.alpha
        f = self.front(t)
        return self.alpha * np.clip((f - self.X) / self.doux, 0, 1)

    def plume(self, t):
        """Position (x, y) de la plume dans le masque, ou None hors écriture."""
        if not (self.t0 < t < self.t1):
            return None
        x = int(np.clip(self.front(t) - self.doux, 0, len(self.cy) - 1))
        return x, self.cy[x]


def lueur(cadre, x, y, rayon, opacite):
    r = int(rayon * 3)
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    a = np.exp(-(xx ** 2 + yy ** 2) / (2 * rayon ** 2)) * opacite
    poser(cadre, a, ETINCELLE, x - r, y - r)


# ------------------------------------------------------------------- étincelles

def sprite_etoile(n=96):
    yy, xx = np.mgrid[-n:n + 1, -n:n + 1] / n
    r = np.hypot(xx, yy)
    rayons = np.exp(-np.abs(xx) * 14) * np.exp(-np.abs(yy) * 2.6) + np.exp(-np.abs(yy) * 14) * np.exp(-np.abs(xx) * 2.6)
    coeur = np.exp(-r ** 2 * 18)
    return np.clip(rayons + coeur, 0, 1)


ETOILE = sprite_etoile()


def etoile(cadre, x, y, taille, opacite):
    if taille < 2 or opacite <= 0:
        return
    s = cv2.resize(ETOILE, (int(taille), int(taille)), interpolation=cv2.INTER_AREA)
    halo = cv2.GaussianBlur(s, (0, 0), max(1, taille / 14))
    poser(cadre, halo, OR, x - taille / 2, y - taille / 2, opacite * .9)
    poser(cadre, s, ETINCELLE, x - taille / 2, y - taille / 2, opacite)


class Gerbe:
    """Petit éclat d'étincelles autour d'un point, déclenché à t0."""

    def __init__(self, cx, cy, t0, rayon, n=9, taille=60):
        self.t0 = t0
        ang = rng.uniform(0, 2 * np.pi, n)
        dist = rng.uniform(.45, 1, n) * rayon
        self.pts = [(cx + np.cos(a) * d, cy + np.sin(a) * d * .7, rng.uniform(0, .25), rng.uniform(.6, 1.2) * taille)
                    for a, d in zip(ang, dist)]

    def dessiner(self, cadre, t):
        for x, y, delai, taille in self.pts:
            u = (t - self.t0 - delai) / .7
            if 0 < u < 1:
                etoile(cadre, x, y, taille * np.sin(np.pi * u), 1.0)


# --------------------------------------------------------------- la bannière

def preparer_banniere():
    im = cv2.imread(os.path.join(ICI, '..', 'sources', 'banniere.webp'))
    x0, y0, x1, y1 = 130, 226, 790, 430  # zone du titre (sous le bout du fouet)
    reg = im[y0:y1, x0:x1].astype(int)
    lum = reg.mean(-1)
    sat = reg.max(-1) - reg.min(-1)
    m = np.zeros(im.shape[:2], np.uint8)
    m[y0:y1, x0:x1] = ((lum < 200) & (sat < 70)) * 255
    # écarte le bout du fouet du logo, qui dépasse dans la zone (taches isolées en haut)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    for k in range(1, n):
        if st[k, cv2.CC_STAT_TOP] + st[k, cv2.CC_STAT_HEIGHT] < 245:
            m[lab == k] = 0
    m = cv2.dilate(m, np.ones((5, 5), np.uint8), iterations=2)
    fond = cv2.inpaint(im, m, 9, cv2.INPAINT_TELEA)
    o, B = im.astype(float).mean(-1), fond.astype(float).mean(-1)
    alpha = np.clip((B - o) / np.maximum(B - ENCRE.mean(), 1), 0, 1)
    alpha[m == 0] = 0
    ys, xs = np.where(alpha > 0.02)
    bx0, by0, bx1, by1 = xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5
    titre = alpha[by0:by1, bx0:bx1]
    return {
        'img': cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(float),
        'fond': cv2.cvtColor(fond, cv2.COLOR_BGR2RGB).astype(float),
        'titre': titre, 'titre_xy': (bx0, by0),
    }


def couper_exclamation(titre):
    """Sépare « Je pâtisse » du « ! » (dernière colonne vide avant le point)."""
    cols = titre.sum(0) > 0.3
    vide = np.where(~cols)[0]
    coupe = vide[vide < len(cols) - 5].max()
    corps, excl = titre.copy(), titre.copy()
    corps[:, coupe:] = 0
    excl[:, :coupe] = 0
    return corps, excl, coupe


def pop(cadre, alpha, couleur, x, y, t, t0, duree=.35):
    """Apparition « qui rebondit » d'un masque, centrée sur lui-même."""
    u = (t - t0) / duree
    if u <= 0:
        return
    s = ease_out_back(u, 2.2) if u < 1 else 1.0
    s = max(s, .05)
    h, w = alpha.shape
    a = redim(alpha, s)
    poser(cadre, a, couleur, x + w / 2 - a.shape[1] / 2, y + h / 2 - a.shape[0] / 2, min(1, u * 2.5))


def zoom(cadre, s):
    if abs(s - 1) < 1e-4:
        return cadre
    H, W = cadre.shape[:2]
    M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, s)
    return cv2.warpAffine(cadre, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def fondu(cadre, t, entree, sortie=None, duree_sortie=1.2):
    a = ease_out(t / entree) if entree else 1.0
    if sortie is not None and t > sortie:
        a *= 1 - ease_in_out((t - sortie) / duree_sortie)
    return ROSE * (1 - a) + cadre * a


# ----------------------------------------------------------------- les scènes

class Paysage:
    """16:9 — la bannière entière, sur un fond flouté d'elle-même."""
    W, H = 1920, 1080

    def __init__(self, b):
        self.b = b
        self.s = self.W / b['img'].shape[1]
        self.oy = (self.H - round(b['img'].shape[0] * self.s)) // 2
        couv = redim(b['fond'], self.H / b['fond'].shape[0])
        cx = (couv.shape[1] - self.W) // 2
        flou = cv2.GaussianBlur(couv[:, cx:cx + self.W], (0, 0), 45)
        self.base = flou * .55 + ROSE * .45
        fond = redim(b['fond'], self.s)
        self.base_alpha = bord_doux(*fond.shape[:2], 36)
        poser_image(self.base, fond, self.base_alpha, 0, self.oy)

    def vers_cadre(self, x, y):
        return x * self.s, y * self.s + self.oy


class Portrait:
    """9:16 — logo en haut, titre au milieu, photo du gâteau en bas."""
    W, H = 1080, 1920

    def __init__(self, b):
        self.b = b
        f = b['fond']
        papier = f[260:420, 120:780].reshape(-1, 3).mean(0)
        bruit = cv2.GaussianBlur(rng.normal(0, 1, (self.H, self.W)), (0, 0), 60)
        bruit = bruit / np.abs(bruit).max()
        grain = rng.normal(0, 1.2, (self.H, self.W))
        self.base = papier + (bruit * 5 + grain)[..., None]
        # photo du gâteau, fondue par le haut
        photo = redim(f[70:, 965:], self.W / (f.shape[1] - 965))  # sans l'icône « Communauté »
        ph = photo.shape[0]
        a = np.clip(np.arange(ph) / 260, 0, 1)[:, None] ** 1.4 * np.ones((1, self.W))
        self.photo, self.photo_alpha, self.photo_y = photo, a, self.H - ph
        # logo (fouet), rogné dans la bannière
        logo = f[14:226, 340:700]
        self.logo = redim(logo, 2.1)
        self.logo_alpha = bord_doux(*self.logo.shape[:2], 40)
        self.logo_xy = ((self.W - self.logo.shape[1]) // 2, 110)
        self.s_titre = 1.55

    def decor(self, t, entree=True):
        c = self.base.copy()
        u = ease_out((t - .1) / 1.1) if entree else 1.0
        poser_image(c, self.photo, self.photo_alpha * u, 0, self.photo_y + int(60 * (1 - u)))
        u = (t - .3) / .6 if entree else 1.0
        if u > 0:
            s = ease_out_back(u, 1.4) if u < 1 else 1.0
            logo = redim(self.logo, max(s, .05))
            al = redim(self.logo_alpha, max(s, .05)) * min(1, u * 2)
            lx = self.logo_xy[0] + (self.logo.shape[1] - logo.shape[1]) // 2
            ly = self.logo_xy[1] + (self.logo.shape[0] - logo.shape[0]) // 2
            poser_image(c, logo, al, lx, ly)
        return c


def scintillements(cadre, pts, t):
    """Étoiles qui clignotent doucement en continu (décor)."""
    for x, y, phase, taille in pts:
        v = np.sin(2 * np.pi * (t * .9 + phase))
        if v > .3:
            etoile(cadre, x, y, taille * (v - .3) / .7, .9)


def intro(scene, t, ctx):
    b = scene.b
    if isinstance(scene, Paysage):
        c = scene.base.copy()
        x, y = scene.vers_cadre(*b['titre_xy'])
    else:
        c = scene.decor(t)
        x = (scene.W - ctx['corps'].shape[1]) / 2
        y = 590
    ec = ctx['ecriture']
    m = ec.masque(t)
    if m is not None:
        poser(c, m, ENCRE, x, y)
    p = ec.plume(t)
    if p:
        lueur(c, x + p[0], y + p[1], 9, .85)
    ex, ey = ctx['excl_xy']
    pop(c, ctx['excl'], ENCRE, x + ex, y + ey, t, HIT - .02)
    ctx['gerbe'].dessiner(c, t)
    scintillements(c, ctx['scint'], t)
    if isinstance(scene, Paysage):
        c = zoom(c, 1 + .045 * (1 - ease_out(t / 5)))
    return fondu(c, t, .5)


def outro(scene, t, ctx):
    if isinstance(scene, Paysage):
        c = scene.base.copy()
    else:
        c = scene.decor(t, entree=False)
    x1, y1 = ctx['l1_xy']
    m = ctx['ecriture'].masque(t)
    if m is not None:
        poser(c, m, ENCRE, x1, y1)
    p = ctx['ecriture'].plume(t)
    if p:
        lueur(c, x1 + p[0], y1 + p[1], 9, .85)
    # adresse du site : montée douce
    u = ease_out((t - 2.5) / .5)
    if u > 0:
        x2, y2 = ctx['l2_xy']
        poser(c, ctx['url'], BORDEAUX, x2, y2 + 30 * (1 - u), u)
    # soulignement tracé sur l'accord final
    u = ease_out((t - HIT) / .45)
    if u > 0:
        sx, sy, sw = ctx['souligne']
        trait = np.ones((ctx['ep'], max(1, int(sw * u))))
        trait = cv2.GaussianBlur(trait, (0, 0), .8) if trait.shape[1] > 3 else trait
        poser(c, trait, BORDEAUX, sx, sy, .85)
    ctx['gerbe'].dessiner(c, t)
    scintillements(c, ctx['scint'], t)
    return fondu(c, t, .4, sortie=5.3)


# --------------------------------------------------------------- préparation

def contexte_intro(scene):
    b = scene.b
    titre = redim(b['titre'], scene.s if isinstance(scene, Paysage) else scene.s_titre)
    corps, excl, coupe = couper_exclamation(titre)
    if isinstance(scene, Paysage):
        x, y = scene.vers_cadre(*b['titre_xy'])
        sc = [(scene.vers_cadre(605, 135)[0], scene.vers_cadre(605, 135)[1], 0, 46),
              (scene.vers_cadre(640, 100)[0], scene.vers_cadre(640, 100)[1], .45, 34),
              (scene.vers_cadre(1500, 60)[0], scene.vers_cadre(1500, 60)[1], .2, 40),
              (scene.vers_cadre(1580, 560)[0], scene.vers_cadre(1580, 560)[1], .7, 36)]
    else:
        x, y = (scene.W - corps.shape[1]) / 2, 590
        lx, ly = scene.logo_xy
        sc = [(lx + 560, ly + 150, 0, 50), (lx + 600, ly + 90, .45, 36),
              (930, scene.photo_y + 380, .2, 44), (160, scene.photo_y + 600, .7, 38)]
    ys, xs = np.where(excl > .02)
    ex0, ey0 = xs.min(), ys.min()
    excl = excl[ey0:ys.max() + 1, ex0:xs.max() + 1]
    gerbe = Gerbe(x + ex0 + excl.shape[1] / 2, y + ey0 + excl.shape[0] / 2, HIT, excl.shape[0] * .9,
                  n=10, taille=excl.shape[0] * .7)
    return {'corps': corps, 'excl': excl, 'excl_xy': (ex0, ey0), 'ecriture': Ecriture(corps, .9, 3.5), 'gerbe': gerbe, 'scint': sc}


def contexte_outro(scene):
    if isinstance(scene, Paysage):
        k = scene.s
        f1, f2 = police('parisienne', int(78 * k)), police('playfair-display', int(62 * k), 700)
        l1, url = masque_texte('Retrouvez-nous sur…', f1), masque_texte('jepatisse.com', f2)
        cx = scene.vers_cadre(465, 0)[0]
        y1 = scene.vers_cadre(0, 232)[1]
        y2 = y1 + l1.shape[0] + 8 * k
        sc = [(scene.vers_cadre(605, 135)[0], scene.vers_cadre(605, 135)[1], 0, 46),
              (scene.vers_cadre(1500, 60)[0], scene.vers_cadre(1500, 60)[1], .2, 40),
              (scene.vers_cadre(1580, 560)[0], scene.vers_cadre(1580, 560)[1], .7, 36)]
    else:
        f1, f2 = police('parisienne', 132), police('playfair-display', 112, 700)
        l1, url = masque_texte('Retrouvez-nous sur…', f1), masque_texte('jepatisse.com', f2)
        cx = scene.W / 2
        y1 = 590
        y2 = y1 + l1.shape[0] + 22
        lx, ly = scene.logo_xy
        sc = [(lx + 560, ly + 150, 0, 50), (930, scene.photo_y + 380, .2, 44), (160, scene.photo_y + 600, .7, 38)]
    x1, x2 = cx - l1.shape[1] / 2, cx - url.shape[1] / 2
    ep = max(3, int(url.shape[0] * .045))
    souligne = (x2 + 10, y2 + url.shape[0] + 2, url.shape[1] - 20)
    gerbe = Gerbe(cx, y2 + url.shape[0] / 2, HIT, url.shape[1] * .55, n=12, taille=url.shape[0] * .9)
    return {'ecriture': Ecriture(l1, .4, 2.4), 'url': url, 'l1_xy': (x1, y1), 'l2_xy': (x2, y2),
            'souligne': souligne, 'ep': ep, 'gerbe': gerbe, 'scint': sc}


# -------------------------------------------------------------------- rendu

def rendre(nom, scene, fn, ctx, duree, wav, dossier):
    sortie = os.path.join(dossier, f'{nom}.mp4')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{scene.W}x{scene.H}', '-r', str(FPS), '-i', '-',
           '-i', wav,
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', sortie]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(round(duree * FPS))
    for i in range(n):
        cadre = fn(scene, i / FPS, ctx)
        p.stdin.write(np.clip(cadre, 0, 255).astype(np.uint8).tobytes())
    p.stdin.close()
    p.wait()
    print(sortie)
    return sortie


def apercu(dossier, instants):
    """Quelques images fixes en PNG, pour régler la mise en page sans encoder."""
    b = preparer_banniere()
    for fmt, Scene in (('16x9', Paysage), ('9x16', Portrait)):
        scene = Scene(b)
        for mode, fn, ctx in (('intro', intro, contexte_intro(scene)), ('outro', outro, contexte_outro(scene))):
            for t in instants:
                c = np.clip(fn(scene, t, ctx), 0, 255).astype(np.uint8)
                Image.fromarray(c).save(os.path.join(dossier, f'{mode}-{fmt}-{t:.2f}.png'))


def main():
    if os.environ.get('APERCU'):
        apercu(sys.argv[1], [float(v) for v in os.environ['APERCU'].split(',')])
        return
    dossier = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ICI, '..', 'videos')
    os.makedirs(dossier, exist_ok=True)
    b = preparer_banniere()
    with tempfile.TemporaryDirectory() as tmp:
        wavs = {}
        for mode in ('intro', 'outro'):
            wavs[mode] = os.path.join(tmp, f'{mode}.wav')
            subprocess.run([sys.executable, os.path.join(ICI, 'musique.py'), wavs[mode], mode], check=True)
        for fmt, Scene in (('16x9', Paysage), ('9x16', Portrait)):
            scene = Scene(b)
            rendre(f'intro-{fmt}', scene, intro, contexte_intro(scene), 5.0, wavs['intro'], dossier)
            rendre(f'outro-{fmt}', scene, outro, contexte_outro(scene), 6.5, wavs['outro'], dossier)


if __name__ == '__main__':
    main()
