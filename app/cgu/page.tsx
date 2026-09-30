// Conditions générales d'utilisation — page publique, statique (JEP-129).
//
// Même construction que `/cgv` et `/confidentialite`. Règle de rédaction
// reprise de la politique de confidentialité : ne rien promettre que le code
// ne tienne pas. D'où, notamment :
// - la suppression du compte se DEMANDE via le formulaire de contact — il
//   n'existe pas de suppression en libre-service dans `/reglages` ;
// - les photos d'une recette privée sont signalées comme accessibles par leur
//   adresse (conteneur Swift `jp-photos` public) : seul le texte est privé ;
// - avis ET recettes publiques sont modérés AVANT publication (`comments`
//   naissent `pending`, cf. lib/reviews-data.ts) ;
// - l'accès « en tant que » d'un administrateur est nommé, pas passé sous
//   silence (cf. « Connexion en tant que » dans CLAUDE.md).
// Toute évolution de ces mécanismes doit se refléter ici, et inversement.
//
// Ce n'est PAS un avis juridique : une relecture par un professionnel reste
// recommandée avant l'ouverture publique.
//
// **Toute modification de fond de ce texte impose une nouvelle
// `CGU_VERSION`** (`lib/cgu.ts`) : c'est cette version qui est tracée dans
// les métadonnées du compte à l'acceptation.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CGU_DATE_AFFICHEE, CGU_VERSION } from '@/lib/cgu';
import { EDITEUR, SITE_URL_CANONIQUE } from '@/lib/legal';

export const metadata: Metadata = { title: 'Conditions générales d’utilisation | Je pâtisse !' };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="font-headline-md text-[20px] text-primary mb-3">{title}</h2>
      <div className="flex flex-col gap-3 font-body-md text-body-md text-on-surface-variant leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Lien({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary underline underline-offset-2">
      {children}
    </Link>
  );
}

function Fort({ children }: { children: React.ReactNode }) {
  return <strong className="text-on-surface">{children}</strong>;
}

export default function CguPage() {
  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[760px] px-margin-mobile py-12 md:px-margin-desktop">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg mb-2">
          Conditions générales d&apos;utilisation
        </h1>
        <p className="mb-10 text-[13px] text-on-surface-variant">
          Dernière mise à jour : {CGU_DATE_AFFICHEE} — version {CGU_VERSION}.
        </p>

        <Section id="objet" title="1. Objet et éditeur">
          <p>
            Les présentes conditions générales d&apos;utilisation (« CGU ») régissent l&apos;utilisation du site
            « Je pâtisse ! », accessible à l&apos;adresse{' '}
            <a href={SITE_URL_CANONIQUE} className="text-primary underline underline-offset-2">
              {SITE_URL_CANONIQUE.replace('https://', '')}
            </a>
            , plateforme de partage, de planification et de réalisation de recettes de pâtisserie. Le site est édité
            par {EDITEUR.nom}, {EDITEUR.statut.toLowerCase()}, identifié dans les{' '}
            <Lien href="/mentions-legales">mentions légales</Lien>.
          </p>
          <p>
            Les CGU sont acceptées lors de la création d&apos;un compte ; elles s&apos;appliquent à tout visiteur dès
            l&apos;utilisation du site. Elles sont complétées par :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              la <Lien href="/confidentialite">politique de confidentialité</Lien>, qui décrit le traitement des
              données personnelles ;
            </li>
            <li>
              les <Lien href="/cgv">conditions générales de vente</Lien>, qui s&apos;appliquent en plus aux membres
              abonnés à une formule payante et prévalent pour tout ce qui concerne l&apos;abonnement.
            </li>
          </ul>
        </Section>

        <Section id="acces" title="2. Accès au service">
          <p>
            La consultation du site est libre. La création d&apos;un compte est nécessaire pour utiliser le carnet de
            recettes, publier, créer des fournées, déposer un avis ou participer à la boîte à idées.
          </p>
          <p>
            Le service est réservé aux personnes de <Fort>15 ans ou plus</Fort> ; en deçà, l&apos;autorisation
            d&apos;un titulaire de l&apos;autorité parentale est requise. La souscription d&apos;un abonnement payant
            est réservée aux personnes majeures (voir les <Lien href="/cgv">CGV</Lien>).
          </p>
        </Section>

        <Section id="compte" title="3. Compte et pseudo">
          <p>
            Chaque membre est responsable de la confidentialité de ses identifiants et de l&apos;activité réalisée
            depuis son compte.
          </p>
          <p>
            Le pseudo est affiché publiquement à côté des contenus du membre. Il ne doit comporter ni propos
            injurieux ou haineux, ni usurpation d&apos;identité, ni référence à une personnalité. Il fait
            l&apos;objet d&apos;un contrôle automatisé avant validation et peut être refusé sans intervention
            humaine. Un membre qui conteste ce refus peut écrire via le{' '}
            <Lien href="/contact">formulaire de contact</Lien> : sa demande sera réexaminée par une personne.
          </p>
        </Section>

        <Section id="contenus" title="4. Contenus des membres">
          <p>Chaque recette relève de l&apos;un de deux modes de publication.</p>

          <h3 className="font-label-md text-label-md text-on-surface mt-2">4.1 Mode privé</h3>
          <p>
            Le texte de la recette n&apos;est visible que par son auteur et les membres avec lesquels il la partage,
            recette par recette ou en partageant son carnet. « Je pâtisse ! » ne fait{' '}
            <Fort>aucune diffusion ni exploitation commerciale</Fort> d&apos;une recette privée. Elle n&apos;est
            consultée ou traitée que :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              par les traitements techniques que le membre déclenche lui-même (import ou ajustement des quantités par
              intelligence artificielle, par exemple) ;
            </li>
            <li>
              lors d&apos;un accès ponctuel d&apos;un administrateur, pour l&apos;assistance ou la modération, limité
              dans le temps et enregistré dans un journal d&apos;audit ;
            </li>
          </ul>
          <p>
            dans les conditions décrites par la <Lien href="/confidentialite">politique de confidentialité</Lien>.
          </p>
          <p>
            <Fort>Les photos ne bénéficient pas de la même protection que le texte</Fort> : une photo déposée sur le
            site, y compris dans une recette privée, est accessible à toute personne qui dispose de son adresse. Ne
            déposez pas d&apos;image que vous souhaitez garder strictement confidentielle.
          </p>

          <h3 className="font-label-md text-label-md text-on-surface mt-2">4.2 Mode public</h3>
          <p>
            La recette est visible par tous les visiteurs du site, après examen (article 5). En demandant la
            publication d&apos;une recette en mode public, le membre :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              concède à « Je pâtisse ! » une licence <Fort>non exclusive, gratuite et mondiale</Fort>{' '}
              d&apos;affichage, de reproduction et de représentation de la recette et de ses photos, sur le site et
              sur ses propres supports de communication (page d&apos;accueil, « recette à la une », réseaux sociaux
              du site), en mentionnant toujours le pseudo de l&apos;auteur. Cette licence vaut tant que la recette
              est publique : dépubliée ou supprimée avec le compte, elle cesse d&apos;être diffusée sur le site, sans
              obligation de retirer les communications déjà publiées ;
            </li>
            <li>garantit être titulaire des droits sur le texte et les photos publiés ;</li>
            <li>
              s&apos;engage, si la recette est inspirée d&apos;un livre, d&apos;un site ou d&apos;un tiers, à
              l&apos;avoir suffisamment adaptée et reformulée pour exclure toute qualification de plagiat ou de
              contrefaçon ;
            </li>
            <li>reste titulaire de ses droits de propriété intellectuelle.</li>
          </ul>

          <h3 className="font-label-md text-label-md text-on-surface mt-2">4.3 Réutilisation par les autres membres</h3>
          <p>
            Une recette publique peut être reprise par les autres membres pour leur usage personnel : création
            d&apos;une fournée, liste de courses, composant d&apos;un projet de dessert. Ces reprises sont des{' '}
            <Fort>copies du texte</Fort>, indépendantes de la recette d&apos;origine : elles restent accessibles à
            leur titulaire même si l&apos;auteur modifie ou supprime ensuite sa recette ou son compte.{' '}
            <Fort>Les photos ne sont jamais copiées.</Fort>
          </p>
          <p>
            Lorsqu&apos;un projet de dessert reprend la recette d&apos;un autre membre, le pseudo de celui-ci y reste
            crédité. L&apos;auteur peut en demander le retrait via le{' '}
            <Lien href="/contact">formulaire de contact</Lien>.
          </p>

          <h3 className="font-label-md text-label-md text-on-surface mt-2">4.4 Contenus interdits</h3>
          <p>
            La reproduction à l&apos;identique, sans autorisation expresse, d&apos;un contenu protégé par le droit
            d&apos;auteur (texte descriptif, photographie) est strictement interdite, de même que tout contenu
            injurieux, haineux, trompeur ou contraire à la loi.
          </p>
        </Section>

        <Section id="moderation" title="5. Modération">
          <p>
            Une recette soumise pour le mode public est examinée <Fort>avant</Fort> sa publication. Un contrôle
            automatisé en vérifie d&apos;abord le contenu et recherche d&apos;éventuelles reprises de textes
            existants, y compris par une recherche web de quelques-unes de ses phrases. Ce contrôle ne rend
            qu&apos;un avis indicatif : <Fort>la décision de publier ou de refuser est prise par une personne</Fort>.
          </p>
          <p>
            Les avis sur les recettes sont eux aussi <Fort>validés par une personne avant publication</Fort> ; un
            score indicatif calculé par intelligence artificielle sert uniquement à ordonner la file de modération.
          </p>
          <p>
            Un contenu refusé l&apos;est avec un motif. Un contenu contraire aux présentes CGU peut être refusé,
            dépublié ou supprimé à tout moment.
          </p>
        </Section>

        <Section id="ia" title="6. Contenus générés par intelligence artificielle">
          <p>
            Certaines fonctionnalités s&apos;appuient sur une intelligence artificielle (import de recette,
            ajustement des quantités, propositions du mode projet). Leurs résultats sont des{' '}
            <Fort>propositions indicatives</Fort>, susceptibles d&apos;erreurs de lecture, de quantité ou
            d&apos;unité, que le membre doit vérifier. Il reste responsable des contenus qu&apos;il enregistre ou
            publie à partir de ces propositions.
          </p>
        </Section>

        <Section id="formules" title="7. Formules payantes">
          <p>
            Certaines fonctionnalités sont réservées aux formules payantes décrites sur la page{' '}
            <Lien href="/plans">Nos formules</Lien>. La souscription, la facturation, la résiliation de
            l&apos;abonnement et le droit de rétractation sont régis par les <Lien href="/cgv">CGV</Lien>.
          </p>
        </Section>

        <Section id="partenaires" title="8. Contenus partenaires">
          <p>
            Le site peut afficher des encarts de partenaires, identifiés comme tels. « Je pâtisse ! » n&apos;est pas
            responsable des sites ou offres vers lesquels ils renvoient.
          </p>
        </Section>

        <Section id="responsabilite" title="9. Responsabilité">
          <p>
            Les recettes, temps de préparation, quantités, informations allergènes et conseils publiés par les membres
            sont fournis <Fort>à titre indicatif</Fort>. Les informations relatives aux allergènes sont une aide au
            tri : <Fort>elles ne constituent en aucun cas une garantie de sécurité alimentaire</Fort>. Il appartient à
            chacun de vérifier la composition réelle des ingrédients qu&apos;il utilise.
          </p>
          <p>Chaque membre est seul responsable des contenus qu&apos;il publie.</p>
        </Section>

        <Section id="disponibilite" title="10. Disponibilité du service">
          <p>
            « Je pâtisse ! » s&apos;efforce d&apos;assurer un accès continu au site, sans garantie de disponibilité
            permanente : des interruptions peuvent survenir pour maintenance ou en raison d&apos;une panne d&apos;un
            prestataire technique. Les fonctionnalités peuvent évoluer ; pour les formules payantes, les engagements
            des <Lien href="/cgv">CGV</Lien> s&apos;appliquent.
          </p>
        </Section>

        <Section id="suppression" title="11. Suspension et suppression du compte">
          <p>
            <Fort>Par le membre.</Fort> Chaque membre peut demander la suppression de son compte à tout moment via le{' '}
            <Lien href="/contact">formulaire de contact</Lien> (type « Mes données personnelles »). Le compte et ses
            contenus sont alors effacés dans les conditions et délais indiqués par la{' '}
            <Lien href="/confidentialite">politique de confidentialité</Lien>, sous réserve de l&apos;article 4.3.
            Un abonnement en cours se résilie selon les <Lien href="/cgv">CGV</Lien>.
          </p>
          <p>
            <Fort>Par « Je pâtisse ! ».</Fort> Un compte peut être suspendu ou supprimé :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              en cas de manquement grave ou répété aux présentes CGU (contenus interdits, usurpation d&apos;identité,
              fraude, atteinte au site ou à d&apos;autres membres) ;
            </li>
            <li>
              s&apos;il a été créé par une personne de moins de 15 ans sans autorisation parentale, dans les
              conditions prévues par la politique de confidentialité.
            </li>
          </ul>
          <p>
            Le membre en est informé au préalable, sauf urgence. Pour un abonnement en cours, les CGV
            s&apos;appliquent.
          </p>
        </Section>

        <Section id="modification" title="12. Modification des CGU">
          <p>
            « Je pâtisse ! » peut modifier les présentes CGU ; la version et la date de mise à jour figurent en tête
            de ce document. En cas de modification substantielle, les membres en sont informés et peuvent être
            invités à accepter la nouvelle version lors de leur prochaine connexion.
          </p>
        </Section>

        <Section id="droit" title="13. Droit applicable et litiges">
          <p>
            Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable est recherchée
            en priorité, via le <Lien href="/contact">formulaire de contact</Lien> ou à l&apos;adresse{' '}
            <a href={`mailto:${EDITEUR.email}`} className="text-primary underline underline-offset-2">
              {EDITEUR.email}
            </a>
            . Le membre consommateur peut également recourir gratuitement au médiateur de la consommation indiqué
            dans les <Lien href="/cgv#reclamations">CGV</Lien>.
          </p>
        </Section>

        <p className="mt-12 text-[13px] text-on-surface-variant">
          Ces conditions décrivent le fonctionnement réel du service au meilleur de notre connaissance. La version
          et la date de mise à jour ci-dessus font foi.
        </p>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
