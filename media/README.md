# Médias — intro et outro des vidéos

Habillage des vidéos tutos « Je pâtisse ! ». Hors du site : rien ici n'est
servi par l'application ni lu par le build (`media/` n'est pas `public/`).

| Fichier | Format | Durée | Contenu |
|---|---|---|---|
| `videos/intro-16x9.mp4` | 1920×1080 (YouTube) | 5 s | La bannière apparaît, « Je pâtisse ! » s'écrit, le « ! » tombe sur l'accord final |
| `videos/intro-9x16.mp4` | 1080×1920 (Reels, Shorts, TikTok) | 5 s | Idem, mise en page verticale |
| `videos/outro-16x9.mp4` | 1920×1080 | 6,5 s | « Retrouvez-nous sur… » s'écrit, puis `jepatisse.com`, souligné sur l'accord final, fondu |
| `videos/outro-9x16.mp4` | 1080×1920 | 6,5 s | Idem, vertical |

H.264 + AAC, 30 images/s, son à −14 LUFS — un niveau qui laisse la place à
la voix du tuto qui suit.

## Musique

Composée **par programme** (`generer/musique.py`) : glockenspiel, ukulélé,
basse pizzicato, petite batterie, 120 BPM en do majeur. Aucun échantillon
extérieur — il n'y a donc aucun droit à déclarer sur YouTube, Instagram ou
TikTok. Intro et outro partagent le même motif.

## Régénérer

Depuis la racine du dépôt (Python 3, ffmpeg) :

```bash
pip install numpy scipy opencv-python-headless fonttools brotli pillow
python3 media/generer/video.py            # écrit les 4 MP4 dans media/videos/
APERCU=2,4.2 python3 media/generer/video.py /tmp/apercu   # images fixes PNG, sans encoder
```

Sources : la bannière du site (`sources/banniere.webp`) et les polices du site
(`app/fonts/*.woff2` — Parisienne pour l'écriture, Playfair Display pour
l'adresse). Le titre d'origine est effacé de la bannière puis « réécrit » à
partir de sa forme exacte : l'image finale de l'intro est la bannière au pixel
près. Les instants clés (accord final à 4,0 s) sont partagés entre
`musique.py` (`HIT`) et `video.py` (`HIT`) — en changer un impose de changer
l'autre.
