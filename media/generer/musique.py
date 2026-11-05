"""Jingle « Je pâtisse ! » — synthèse entièrement programmée (aucun échantillon
extérieur, donc aucun droit à céder) : glockenspiel, ukulélé, basse pizzicato,
petite batterie, scintillement final.

120 BPM, do majeur, deux mesures puis un accord final sur le temps 1 de la
troisième (t = 4,0 s) — les animations s'y calent (« ! » de l'intro, adresse
du site de l'outro).

Usage : python3 musique.py <sortie.wav> intro|outro
"""
import sys
import numpy as np
from scipy.signal import lfilter, butter

SR = 48000
BEAT = 0.5          # 120 BPM
E8 = BEAT / 2       # croche
HIT = 4 * 2 * BEAT  # accord final : début de la 3e mesure (4,0 s)

rng = np.random.default_rng(7)


def note(n):
    """Nom de note (« C6 », « F#5 ») → fréquence."""
    noms = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    ton = noms[n[0]] + (1 if '#' in n else 0)
    octave = int(n[-1])
    midi = 12 * (octave + 1) + ton
    return 440.0 * 2 ** ((midi - 69) / 12)


class Piste:
    def __init__(self, duree):
        self.buf = np.zeros(int(SR * (duree + 3)))

    def add(self, t, sig, gain=1.0):
        i = int(t * SR)
        self.buf[i:i + len(sig)] += sig[: len(self.buf) - i] * gain


def env(n, attaque, decroissance):
    t = np.arange(n) / SR
    a = np.minimum(t / attaque, 1.0)
    return a * np.exp(-t / decroissance)


def glock(f, duree=1.6):
    n = int(SR * duree)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for ratio, amp, dec in [(1, 1, .9), (2.756, .32, .35), (5.404, .12, .14), (8.933, .05, .06)]:
        s += amp * np.sin(2 * np.pi * f * ratio * t) * env(n, .002, dec)
    return s


def pluck(f, duree=0.6, amorti=0.996):
    """Corde pincée (Karplus-Strong) — ukulélé."""
    n = int(SR * duree)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = amorti * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * env(n, .001, duree / 2.5)


def basse(f, duree=0.35):
    n = int(SR * duree)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) + .1 * np.sin(6 * np.pi * f * t)
    return s * env(n, .004, .16)


def kick():
    n = int(SR * .3)
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t / .03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .001, .09)


def bruit_filtre(n, bas, haut):
    b, a = butter(2, [bas / (SR / 2), haut / (SR / 2)], btype='band')
    return lfilter(b, a, rng.uniform(-1, 1, n))


def clap():
    n = int(SR * .25)
    s = bruit_filtre(n, 900, 3500)
    e = np.zeros(n)
    for k, d in enumerate([0, .009, .018]):
        i = int(d * SR)
        e[i:] += env(n - i, .0005, .006 if k < 2 else .07)
    return s * e


def shaker(accent):
    n = int(SR * .08)
    return bruit_filtre(n, 6000, 14000) * env(n, .004, .02) * (1 if accent else .5)


def cymbale():
    n = int(SR * 2.2)
    return bruit_filtre(n, 5000, 15000) * env(n, .002, .55)


def reverb(x, mix=.22):
    """Réverbération de Schroeder (4 filtres en peigne + 2 passe-tout)."""
    wet = np.zeros_like(x)
    for d, g in [(1557, .84), (1617, .83), (1491, .85), (1422, .86)]:
        a = np.zeros(d + 1); a[0] = 1; a[d] = -g
        wet += lfilter([1], a, x)
    for d, g in [(225, .5), (556, .5)]:
        b = np.zeros(d + 1); b[0] = -g; b[d] = 1
        a = np.zeros(d + 1); a[0] = 1; a[d] = -g
        wet = lfilter(b, a, wet)
    return x + mix * wet / 4


ACCORDS = {'C': ['C4', 'E4', 'G4', 'C5'], 'F': ['F4', 'A4', 'C5', 'F5'], 'G': ['G4', 'B4', 'D5', 'G5']}


def strum(p, t, accord, gain=.22, vers_bas=True):
    notes = ACCORDS[accord] if vers_bas else ACCORDS[accord][::-1]
    for k, n in enumerate(notes):
        p.add(t + k * .011, pluck(note(n), .5), gain)


def composer(mode):
    duree = 5.0 if mode == 'intro' else 6.5
    mel, acc, rythme = Piste(duree), Piste(duree), Piste(duree)

    # Mélodie au glockenspiel : (note, durée en croches)
    phrase = [('C6', 1), ('E6', 1), ('G6', 1), ('C7', 1), ('B6', .5), ('C7', .5), ('B6', 1), ('G6', 2),
              ('A6', 1), ('C7', 1), ('A6', 1), ('F6', 1), ('G6', 1), ('B6', 1), ('D7', 1), ('B6', 1)]
    t = 0.0
    for n, d in phrase:
        mel.add(t, glock(note(n)), .5)
        t += d * E8

    # Accords : do (mesure 1), fa puis sol (mesure 2), contretemps au ukulélé
    grille = ['C'] * 4 + ['F'] * 2 + ['G'] * 2
    for temps, a in enumerate(grille):
        strum(acc, temps * BEAT + E8, a, .2, vers_bas=temps % 2 == 0)
    basses = ['C3', 'G2', 'C3', 'G2', 'F2', 'C3', 'G2', 'B2']
    for temps, n in enumerate(basses):
        acc.add(temps * BEAT, basse(note(n)), .4)
        acc.add(temps * BEAT + 3 * E8 / 2, basse(note(n)), .25)  # double-croche de relance

    # Batterie : grosse caisse 1 et 3, clap 2 et 4, shaker en doubles-croches
    for temps in range(8):
        if temps % 2 == 0:
            rythme.add(temps * BEAT, kick(), .55)
        else:
            rythme.add(temps * BEAT, clap(), .35)
    for k in range(32):
        rythme.add(k * E8 / 2, shaker(k % 2 == 1), .12)
    # Roulement de clap pour lancer l'accord final
    for k in range(4):
        rythme.add(HIT - BEAT + k * E8 / 2, clap(), .12 + .06 * k)

    # Accord final : tout l'orchestre sur do, scintillement ascendant
    strum(acc, HIT, 'C', .3)
    acc.add(HIT, basse(note('C2'), 1.2), .6)
    acc.add(HIT, basse(note('C3'), 1.2), .4)
    for n in ['C6', 'E6', 'G6', 'C7']:
        mel.add(HIT, glock(note(n), 2.5), .3)
    for k, n in enumerate(['G6', 'C7', 'E7', 'G7', 'C8', 'E8']):
        mel.add(HIT + .06 + k * .045, glock(note(n), 1.2), .18)
    rythme.add(HIT, kick(), .8)
    rythme.add(HIT, cymbale(), .18)

    mix = reverb(mel.buf * 1.0) + reverb(acc.buf, .15) + rythme.buf
    mix = mix[: int(SR * duree)]
    # Fondu de sortie (dernières secondes)
    fondu = .3 if mode == 'intro' else 1.4
    nf = int(SR * fondu)
    mix[-nf:] *= np.linspace(1, 0, nf) ** 1.5
    mix /= np.abs(mix).max() / 10 ** (-5 / 20)  # crête à −5 dBFS ≈ −14 LUFS : laisse la place à la voix du tuto
    return mix


if __name__ == '__main__':
    sortie, mode = sys.argv[1], sys.argv[2]
    m = composer(mode)
    pcm = (np.clip(m, -1, 1) * 32767).astype('<i2')
    stereo = np.column_stack([pcm, pcm]).ravel()
    import wave
    with wave.open(sortie, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(stereo.tobytes())
    print(sortie, f'{len(m) / SR:.2f} s')
