// Politique de confidentialité — page publique, statique.
//
// Contenu établi à partir de ce que le code du site fait réellement (RLS,
// sous-traitants effectivement intégrés depuis la migration Infomaniak,
// usages de l'IA, impersonation journalisée, durées de conservation codées
// en base — cf. CLAUDE.md et docs/contact-jira.md pour le module contact).
// Règle de rédaction : ne rien promettre que le code ne tienne pas. La purge
// des comptes inactifs et la déclaration d'âge à l'inscription n'existant
// pas, elles n'y figurent pas — les réintroduire ici en même temps que leur
// implémentation, jamais avant.
//
// Ce n'est PAS un avis juridique : une relecture par un professionnel reste
// recommandée avant l'ouverture publique. Les passages entre crochets sont
// des faits encore à vérifier auprès des prestataires (Atlassian : entité et
// région d'hébergement de Jira). Anthropic est
// nommé par son entité PBC (États-Unis) : c'est elle qui facture l'achat de
// crédits d'API de la console (facture du 20/08/2026). Ses conditions
// commerciales prévoient pourtant Anthropic Ireland, Limited pour un client de
// l'EEE : écart non expliqué, à revérifier si Anthropic confirme l'entité
// irlandaise (auquel cas la nommer aux § 4 et § 6). Conservation (30 jours) : article « How long
// do you store my organization's data? » du centre de confidentialité Anthropic. Les durées de conservation annoncées au
// § 8 sont appliquées par pg_cron et pgBackRest : cf. DEPLOY.md, « Tâches
// planifiées » — ne pas en changer une ici sans changer la tâche qui la tient.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';

export const metadata: Metadata = { title: 'Confidentialité | Je pâtisse !' };

const CONTACT_EMAIL = 'contact@jepatisse.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-headline-md text-[20px] text-primary mb-3">{title}</h2>
      <div className="flex flex-col gap-3 font-body-md text-body-md text-on-surface-variant leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SousTitre({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-2 font-semibold text-on-surface">{children}</h3>;
}

function Liste({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 flex flex-col gap-1.5">{children}</ul>;
}

// Tableau à deux ou trois colonnes. Défile horizontalement dans son propre
// cadre plutôt que de faire déborder la page sur mobile.
function Tableau({ entetes, lignes }: { entetes: string[]; lignes: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-outline-variant">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead className="bg-surface-container">
          <tr>
            {entetes.map((e) => (
              <th key={e} className="px-3 py-2 font-semibold text-on-surface align-top">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, i) => (
            <tr key={i} className="border-t border-outline-variant">
              {ligne.map((cellule, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fort({ children }: { children: React.ReactNode }) {
  return <strong className="text-on-surface">{children}</strong>;
}

function LienContact() {
  return (
    <Link href="/contact" className="text-primary underline underline-offset-2">
      formulaire de contact
    </Link>
  );
}

function LienEmail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  );
}

export default function ConfidentialitePage() {
  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[760px] px-margin-mobile py-12 md:px-margin-desktop">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg mb-2">
          Politique de confidentialité
        </h1>
        <p className="mb-10 text-[13px] text-on-surface-variant">Dernière mise à jour : 29 septembre 2026.</p>

        <Section title="1. Responsable du traitement">
          <p>
            Fabien CHENU, entrepreneur individuel, SIREN 788 550 077
            <br />
            20b, rue Marie-Clémence Fouriaux — 51100 Reims
          </p>
          <p>
            Contact : <LienEmail />, ou le <LienContact /> en choisissant le type « Mes données personnelles ».
          </p>
        </Section>

        <Section title="2. Données collectées">
          <SousTitre>Compte</SousTitre>
          <Liste>
            <li>
              Adresse e-mail, pseudo, mot de passe (stocké uniquement sous forme hachée), photo de profil si vous en
              ajoutez une.
            </li>
            <li>
              En cas de connexion avec Google : votre nom et votre adresse e-mail transmis par Google. Ce nom sert de
              suggestion de pseudo, que vous pouvez modifier lors de votre première connexion.
            </li>
          </Liste>

          <SousTitre>Contenus et usage du service</SousTitre>
          <Liste>
            <li>Recettes, photos (couverture, étapes), fournées et leurs notes, listes de courses, favoris.</li>
            <li>Avis et notes laissés sur les recettes, idées proposées et votes dans la boîte à idées.</li>
            <li>Pâtissiers que vous suivez, partages de votre carnet ou de vos recettes avec d&apos;autres membres.</li>
            <li>Projets de dessert (mode projet), y compris l&apos;intention que vous rédigez en texte libre.</li>
          </Liste>

          <SousTitre>Demandes de contact</SousTitre>
          <Liste>
            <li>Message, type de demande, photos jointes le cas échéant, réponses échangées.</li>
            <li>
              Une empreinte de votre adresse IP (hachée, jamais stockée en clair), pour lutter contre les envois
              abusifs.
            </li>
          </Liste>

          <SousTitre>Abonnement payant (le cas échéant)</SousTitre>
          <Liste>
            <li>
              Formule souscrite, statut et historique de l&apos;abonnement, identifiant client chez notre prestataire
              de paiement.
            </li>
            <li>
              <Fort>Nous ne voyons ni ne stockons jamais vos données bancaires</Fort> : elles sont saisies directement
              chez Stripe.
            </li>
          </Liste>

          <SousTitre>Données techniques</SousTitre>
          <Liste>
            <li>Cookies et stockage local strictement nécessaires (voir § 10).</li>
            <li>Journaux de connexion et adresse IP.</li>
            <li>
              Affichages et clics sur les encarts de nos partenaires, rattachés à votre compte si vous êtes connecté.
              Ils servent à établir des statistiques et ne sont jamais transmis aux partenaires sous une forme
              permettant de vous identifier.
            </li>
          </Liste>
        </Section>

        <Section title="3. Finalités et bases légales">
          <Tableau
            entetes={['Finalité', 'Base légale (art. 6 du RGPD)']}
            lignes={[
              ['Création et gestion du compte', 'Exécution du contrat'],
              [
                'Fourniture du service : carnet, fournées, listes de courses, partages, boîte à idées, mode projet',
                'Exécution du contrat',
              ],
              [
                'Fonctions assistées par IA que vous déclenchez (import, ajustement des quantités, propositions du mode projet)',
                'Exécution du contrat',
              ],
              [
                "Gestion de l'abonnement payant et facturation",
                'Exécution du contrat ; obligation légale pour la conservation comptable',
              ],
              [
                "E-mails liés au service (confirmation d'inscription, réponse à une demande, notifications d'abonnement)",
                'Exécution du contrat',
              ],
              [
                'Traitement des demandes de contact et suivi des signalements techniques',
                'Intérêt légitime (répondre aux demandes, corriger les anomalies)',
              ],
              [
                'Modération des contenus : pseudos, avis, idées, détection des idées en double',
                'Intérêt légitime (qualité et sécurité de la communauté)',
              ],
              ['Sécurité du site, prévention des abus, lutte contre le spam', 'Intérêt légitime'],
              [
                "Accès d'un administrateur à un compte à des fins d'assistance ou de modération (voir § 5)",
                'Intérêt légitime',
              ],
              [
                'Statistiques des encarts partenaires',
                'Intérêt légitime (rendre compte de la diffusion aux partenaires)',
              ],
              ['Conservation des données de connexion', 'Obligation légale (LCEN, décret n° 2021-1362)'],
            ]}
          />
          <p>Aucune donnée n&apos;est vendue, ni utilisée à des fins publicitaires par un tiers.</p>
        </Section>

        <Section title="4. Recours à l'intelligence artificielle">
          <p>Certaines fonctionnalités s&apos;appuient sur l&apos;API Claude d&apos;Anthropic PBC (États-Unis) :</p>
          <Liste>
            <li>
              lecture des photos de pages et structuration des recettes importées (texte collé, photo, PDF) ;
            </li>
            <li>ajustement des quantités à partir d&apos;une consigne en texte libre ;</li>
            <li>
              mode projet : proposition de format, de composants et de recettes de base à partir de l&apos;intention
              que vous rédigez ;
            </li>
            <li>contrôle des pseudos à l&apos;inscription ;</li>
            <li>score indicatif sur les avis soumis à modération ;</li>
            <li>
              détection d&apos;idées en double dans la boîte à idées, qui compare le texte des idées déjà publiées ;
            </li>
            <li>
              contrôle des recettes soumises à la publication publique : modération du contenu et détection de
              reprises de textes existants, y compris par une recherche web de quelques phrases de la recette.
            </li>
          </Liste>
          <p>
            Seuls les contenus nécessaires à chaque traitement sont transmis (recette importée, pseudo choisi, avis
            rédigé, texte des idées, recette soumise à la publication). Selon les conditions commerciales
            d&apos;Anthropic, ces données <Fort>ne servent pas à entraîner ses modèles</Fort>. Anthropic les supprime
            automatiquement de ses serveurs <Fort>au plus tard 30 jours</Fort> après leur réception, sauf si une
            conservation plus longue est nécessaire pour faire respecter sa politique d&apos;utilisation ou pour se
            conformer à la loi.
          </p>
          <SousTitre>Décisions automatisées</SousTitre>
          <Liste>
            <li>
              <Fort>Pseudo</Fort> : un pseudo jugé inapproprié par le contrôle automatique est refusé sans
              intervention humaine. Si vous estimez ce refus injustifié, écrivez-nous via le <LienContact /> : une
              personne réexaminera votre demande.
            </li>
            <li>
              <Fort>Avis</Fort> : le score calculé par l&apos;IA ne sert qu&apos;à prioriser la file de modération.
              Tout avis commenté est validé ou refusé par une personne.
            </li>
            <li>
              <Fort>Recettes</Fort> : le contrôle automatique produit un verdict indicatif pour le modérateur. Une
              recette publique d&apos;un membre n&apos;est publiée qu&apos;après validation par une personne.
            </li>
            <li>
              <Fort>Idées</Fort> : la détection de doublons ne fait que suggérer. Aucune idée n&apos;est fusionnée
              ni refusée sans décision d&apos;un administrateur.
            </li>
          </Liste>
        </Section>

        <Section title="5. Accès par l'équipe du site">
          <p>
            Pour l&apos;assistance aux membres et la modération, un administrateur peut se connecter temporairement
            « en tant que » votre compte. Cet accès est :
          </p>
          <Liste>
            <li>limité à une heure par session ;</li>
            <li>
              en lecture seule par défaut — la possibilité d&apos;écrire est réservée aux administrateurs
              expressément habilités ;
            </li>
            <li>
              <Fort>enregistré dans un journal d&apos;audit</Fort> : date, administrateur concerné, écritures
              effectuées ou refusées.
            </li>
          </Liste>
          <p>
            Il n&apos;est jamais utilisé à d&apos;autres fins que l&apos;assistance, la modération ou la sécurité du
            service.
          </p>
        </Section>

        <Section title="6. Destinataires des données">
          <p>
            Vos données ne sont accessibles qu&apos;à l&apos;éditeur du site et aux prestataires suivants, dans la
            limite de ce qui est nécessaire à leur prestation.
          </p>
          <SousTitre>Sous-traitants (art. 28 du RGPD), liés par un contrat de sous-traitance</SousTitre>
          <Liste>
            <li>
              <Fort>Infomaniak Network SA</Fort> (Suisse) — hébergement de l&apos;application, de la base de données
              et des photos, à Genève.
            </li>
            <li>
              <Fort>Anthropic PBC</Fort> (États-Unis) — traitements par IA (voir § 4). Pour la recherche web du contrôle des recettes, Anthropic s&apos;appuie sur des
              sous-traitants situés aux États-Unis (Brave Search et TurboPuffer). La liste complète de ses
              sous-traitants est{' '}
              <a
                href="https://trust.anthropic.com/subprocessors"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                publique
              </a>
              .
            </li>
            <li>
              <Fort>Brevo (Sendinblue SAS)</Fort> (France) — envoi des e-mails.
            </li>
            <li>
              <Fort>Atlassian (Jira)</Fort> [pays et entité contractante à vérifier] — suivi des signalements
              techniques. Le ticket ne contient ni votre e-mail, ni votre nom, ni votre adresse IP : seulement un
              identifiant technique interne. Une demande de type « Mes données personnelles » ne crée jamais de
              ticket.
            </li>
          </Liste>
          <SousTitre>Responsables de traitement indépendants</SousTitre>
          <Liste>
            <li>
              <Fort>Stripe</Fort> (Stripe Payments Europe Ltd, Irlande) — traitement des paiements. Stripe traite
              aussi certaines données pour son propre compte (lutte contre la fraude, obligations réglementaires),
              selon sa propre politique de confidentialité.
            </li>
            <li>
              <Fort>Google</Fort> — uniquement si vous choisissez de vous connecter avec votre compte Google, selon
              sa propre politique de confidentialité.
            </li>
          </Liste>
        </Section>

        <Section title="7. Transferts hors de l'Union européenne">
          <Liste>
            <li>
              <Fort>Suisse (Infomaniak)</Fort> : la Suisse bénéficie d&apos;une décision d&apos;adéquation de la
              Commission européenne.
            </li>
            <li>
              <Fort>États-Unis (Anthropic)</Fort> : transferts encadrés par les clauses contractuelles types de la
              Commission européenne, incorporées à l&apos;accord de traitement des données d&apos;Anthropic.
            </li>
            <li>
              <Fort>États-Unis (Stripe, Inc.)</Fort> : transferts de Stripe Payments Europe vers sa maison mère,
              encadrés par les clauses contractuelles types et le cadre de protection des données UE–États-Unis
              (Data Privacy Framework).
            </li>
            <li>
              <Fort>Atlassian</Fort> : [selon la région d&apos;hébergement du site Jira, à vérifier].
            </li>
          </Liste>
        </Section>

        <Section title="8. Durées de conservation">
          <Tableau
            entetes={['Données', 'Durée']}
            lignes={[
              ['Compte et contenus', 'Tant que le compte existe'],
              [
                'Après suppression du compte',
                'Effacement sous 30 jours, sauvegardes comprises',
              ],
              [
                'Demande de contact',
                '12 mois après sa clôture (24 mois pour un signalement technique, le temps de suivre le correctif jusqu’à sa mise en ligne)',
              ],
              ['Empreinte de l’adresse IP liée à une demande de contact', '30 jours'],
              ['Ticket Jira (sans donnée nominative)', 'Sans limite de durée'],
              ['Journal des accès « en tant que » (§ 5)', '1 an'],
              ['Affichages et clics sur les encarts partenaires (§ 2)', '13 mois'],
              ['Données de connexion', '1 an (LCEN, décret n° 2021-1362)'],
              ['Pièces comptables et factures', '10 ans (art. L123-22 du code de commerce)'],
            ]}
          />
          <p>
            Vous pouvez demander la suppression de votre compte à tout moment via le <LienContact /> (type « Mes
            données personnelles »).
          </p>
          <SousTitre>Contenus publiés, à la suppression du compte</SousTitre>
          <p>
            Vos recettes, y compris celles que vous avez publiées, sont supprimées avec votre compte. Toutefois :
          </p>
          <Liste>
            <li>
              un membre qui a créé une fournée à partir de l&apos;une de vos recettes en conserve une copie du texte
              — jamais des photos, qui ne sont pas copiées ;
            </li>
            <li>
              votre pseudo peut rester affiché comme crédit d&apos;auteur dans les projets de dessert d&apos;autres
              membres qui ont repris l&apos;une de vos recettes. Vous pouvez en demander le retrait.
            </li>
          </Liste>
        </Section>

        <Section title="9. Âge minimum">
          <p>
            Le service est destiné aux personnes de <Fort>15 ans ou plus</Fort>. L&apos;abonnement payant est
            réservé aux personnes majeures.
          </p>
          <p>
            Si nous apprenons qu&apos;un compte a été créé par une personne de moins de 15 ans sans l&apos;autorisation
            du titulaire de l&apos;autorité parentale, ce compte est suspendu et ses données supprimées, sauf
            confirmation de cette autorisation sous un mois. Tout signalement peut être adressé à <LienEmail />.
          </p>
        </Section>

        <Section title="10. Cookies et stockage local">
          <p>
            Le site n&apos;utilise <Fort>aucun cookie publicitaire ni outil de mesure d&apos;audience tiers</Fort>.
            Seuls sont déposés des éléments strictement nécessaires à son fonctionnement, exemptés de consentement :
          </p>
          <Tableau
            entetes={['Élément', 'Rôle', 'Durée']}
            lignes={[
              ['Cookies de session', 'Vous garder connecté', 'Durée de la session d’authentification'],
              [
                'Cookie témoin d’assistance',
                'Signaler une session « en tant que » d’un administrateur (§ 5)',
                '1 heure au plus',
              ],
              [
                'Stockage local du navigateur',
                'Mémoriser la fermeture de la bannière d’installation de l’application',
                '30 jours',
              ],
              [
                'Cache de l’application installée',
                'Afficher une page hors connexion',
                'Jusqu’à la mise à jour suivante du site',
              ],
            ]}
          />
        </Section>

        <Section title="11. Sécurité">
          <Liste>
            <li>Échanges chiffrés (HTTPS imposé, HSTS).</li>
            <li>Mots de passe stockés uniquement sous forme hachée.</li>
            <li>
              Contrôle d&apos;accès au niveau de la base de données (Row Level Security) : chaque requête ne peut lire
              ou modifier que ce que votre session autorise.
            </li>
            <li>Hébergement en Suisse (Genève).</li>
            <li>Accès administrateur restreint et journalisé (§ 5).</li>
            <li>
              Photos jointes aux demandes de contact stockées dans un espace privé, distinct des photos publiques.
            </li>
          </Liste>
          <p>
            Les photos que vous publiez sur vos recettes et votre profil sont accessibles à toute personne disposant
            de leur adresse.
          </p>
        </Section>

        <Section title="12. Vos droits">
          <p>
            Conformément au RGPD et à la loi Informatique et Libertés, vous disposez d&apos;un droit d&apos;accès, de
            rectification, d&apos;effacement, de portabilité, de limitation et d&apos;opposition (pour les
            traitements fondés sur l&apos;intérêt légitime), ainsi que du droit de définir des{' '}
            <Fort>directives sur le sort de vos données après votre décès</Fort>.
          </p>
          <p>
            Pour les exercer : <LienContact /> (type « Mes données personnelles ») ou <LienEmail />. Nous répondons{' '}
            <Fort>sous un mois</Fort>. En cas de doute raisonnable sur votre identité, nous pourrons vous demander de
            la justifier.
          </p>
          <p>
            Vous pouvez aussi introduire une réclamation auprès de la CNIL :{' '}
            <a
              href="https://www.cnil.fr/fr/plaintes"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              cnil.fr/fr/plaintes
            </a>
            .
          </p>
        </Section>

        <Section title="13. Modification de la politique">
          <p>
            Cette politique peut évoluer ; la date de dernière mise à jour figure en haut de ce document.
          </p>
        </Section>

        <p className="mt-12 text-[12px] text-on-surface-variant italic">
          Cette page décrit nos pratiques réelles au meilleur de notre connaissance. La date de mise à jour
          ci-dessus fait foi.
        </p>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
