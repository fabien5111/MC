// Tunnel vers PostgreSQL à travers l'accès SSH du nœud applicatif (216658).
//
// **Pourquoi.** Le port 5432 n'est pas exposé sur Internet, et ne doit pas
// l'être. Régénérer les types imposait donc d'ouvrir un Endpoint temporaire
// sur le nœud PostgreSQL, puis de le refermer : deux gestes dans la console
// Infomaniak à chaque régénération, et une base joignable de partout entre
// les deux. Or le nœud applicatif joint déjà la base par le réseau interne
// d'Infomaniak (`10.101.32.133:5432`), et le workflow de déploiement y entre
// déjà en SSH. On emprunte ce chemin : aucun port public, aucun geste manuel.
//
// **Comment.** Un serveur TCP local (127.0.0.1, port libre) ; chaque connexion
// reçue lance `ssh <alias> node -e …` sur le nœud, qui ouvre la connexion vers
// la base et relaie les octets dans les deux sens par l'entrée/sortie standard
// de la session SSH. Pas de redirection de port SSH (`-L`) : la passerelle
// Infomaniak n'est pas garantie de l'accepter, alors que l'exécution d'une
// commande est éprouvée — c'est ce que fait le déploiement.
//
// **Repère de début de flux.** Le nœud écrit `MC-TUNNEL-OK` sur sa sortie dès
// la connexion à la base établie ; tout ce qui précède (bannière éventuelle de
// la passerelle, message du profil du shell) est jeté. Sans lui, la moindre
// ligne parasite corromprait le protocole PostgreSQL, avec une erreur qui ne
// dirait rien du tunnel.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const REPERE = Buffer.from('MC-TUNNEL-OK\n');

// Code exécuté SUR LE NŒUD. Sans apostrophe : il voyage entre apostrophes dans
// la commande distante. Avec `node -e`, les arguments suivent l'exécutable
// directement (process.argv[1] = hôte, [2] = port).
const RELAIS_DISTANT = [
  'const s=require("net").connect(+process.argv[2],process.argv[1]);',
  's.setTimeout(15000,()=>{process.stderr.write("tunnel: délai dépassé vers la base\\n");process.exit(1)});',
  's.on("connect",()=>{s.setTimeout(0);process.stdout.write("MC-TUNNEL-OK\\n");process.stdin.pipe(s);s.pipe(process.stdout)});',
  's.on("error",e=>{process.stderr.write("tunnel: "+e.message+"\\n");process.exit(1)});',
  's.on("close",()=>process.exit(0));',
  'process.stdin.on("end",()=>s.end());',
].join('');

// `node` n'est dans le PATH que d'un shell interactif sur ce nœud (cf.
// scripts/deploiement-app.sh, « le piège de la session non interactive »).
function commandeDistante(hote, port) {
  if (!/^[A-Za-z0-9.-]+$/.test(hote) || !/^\d+$/.test(String(port))) {
    throw new Error(`cible de tunnel invalide : ${hote}:${port}`);
  }
  return (
    'for d in /opt/.nvm/versions/node/*/bin "$HOME"/.nvm/versions/node/*/bin; do ' +
    '[ -x "$d/node" ] && PATH="$d:$PATH"; done; ' +
    `exec node -e '${RELAIS_DISTANT}' ${hote} ${port}`
  );
}

/**
 * Ouvre le tunnel. Résout avec le port local à utiliser et une fonction de
 * fermeture. `commandeSsh` n'existe que pour les essais (substitut de `ssh`).
 */
export function ouvrirTunnel({ alias, hote, port, commandeSsh = 'ssh', journal = console.error }) {
  const distante = commandeDistante(hote, port);
  const enfants = new Set();

  const serveur = createServer((socket) => {
    const enfant = spawn(commandeSsh, [alias, distante], { stdio: ['pipe', 'pipe', 'pipe'] });
    enfants.add(enfant);

    let attente = Buffer.alloc(0);
    let ouvert = false;
    enfant.stdout.on('data', (morceau) => {
      if (ouvert) {
        if (!socket.write(morceau)) enfant.stdout.pause();
        return;
      }
      attente = Buffer.concat([attente, morceau]);
      const i = attente.indexOf(REPERE);
      if (i === -1) return;
      if (i > 0) journal(`[tunnel] texte ignoré avant le flux : ${attente.subarray(0, i).toString().trim()}`);
      ouvert = true;
      const reste = attente.subarray(i + REPERE.length);
      attente = Buffer.alloc(0);
      if (reste.length) socket.write(reste);
    });
    socket.on('drain', () => enfant.stdout.resume());
    enfant.stderr.on('data', (m) => journal(`[tunnel] ${m.toString().trim()}`));

    // Le client PostgreSQL parle le premier : son message est mis en tampon
    // par la session SSH jusqu'à ce que le nœud ait ouvert la connexion.
    socket.pipe(enfant.stdin);
    enfant.stdin.on('error', () => socket.destroy());
    socket.on('error', () => enfant.kill());
    socket.on('close', () => enfant.kill());
    enfant.on('close', () => {
      enfants.delete(enfant);
      socket.destroy();
    });
  });

  return new Promise((resoudre, rejeter) => {
    serveur.once('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => {
      resoudre({
        port: serveur.address().port,
        fermer: () =>
          new Promise((fin) => {
            for (const e of enfants) e.kill();
            serveur.close(() => fin());
          }),
      });
    });
  });
}
