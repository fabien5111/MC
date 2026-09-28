// Conditions générales de vente — page publique, statique.
//
// Même construction que `/confidentialite`. Texte établi à partir de ce que
// le module d'abonnements fait réellement (docs/abonnements.md : essai sans
// moyen de paiement, quotas par période, montée au prorata / descente à
// l'échéance, relances Stripe avant annulation, conditions de la version
// souscrite préservées). Ce n'est PAS un avis juridique : une relecture par
// un professionnel reste nécessaire avant la commercialisation.
//
// Les mentions entre crochets (identité de l'éditeur, durée de l'essai,
// médiateur…) sont des informations encore à fournir — laissées visibles à
// dessein plutôt qu'inventées.
//
// **Toute modification de fond de ce texte impose une nouvelle
// `CGV_VERSION`** (`lib/cgv.ts`) : c'est cette version qui est tracée sur
// chaque abonnement Stripe à l'acceptation.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CGV_DATE_AFFICHEE, CGV_VERSION } from '@/lib/cgv';

export const metadata: Metadata = { title: 'Conditions générales de vente | Je pâtisse !' };

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

export default function CgvPage() {
  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[760px] px-margin-mobile py-12 md:px-margin-desktop">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg mb-2">
          Conditions générales de vente
        </h1>
        <p className="mb-10 text-[13px] text-on-surface-variant">
          Dernière mise à jour : {CGV_DATE_AFFICHEE} — version {CGV_VERSION}.
        </p>

        <Section id="vendeur" title="1. Identité du vendeur">
          <p>
            Le site « Je pâtisse ! », accessible à l&apos;adresse www.jepatisse.com (ci-après « le Site »), est édité
            par : [Nom ou raison sociale], [forme juridique, capital le cas échéant], immatriculé(e) sous le n° [SIREN
            / RCS], dont le siège est situé [adresse postale complète].
          </p>
          <p>
            TVA non applicable, art. 293 B du CGI.
            <br />
            Contact : [contact@jepatisse.com]
          </p>
        </Section>

        <Section id="definitions" title="2. Définitions">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              <strong className="text-on-surface">Membre</strong> : personne physique titulaire d&apos;un compte sur le
              Site, créé conformément aux [Conditions générales d&apos;utilisation — lien].
            </li>
            <li>
              <strong className="text-on-surface">Formule</strong> : ensemble de fonctionnalités et de limites
              d&apos;usage auquel donne accès un compte. Il existe une formule gratuite et des formules payantes,
              décrites sur la page <Lien href="/plans">Nos formules</Lien>.
            </li>
            <li>
              <strong className="text-on-surface">Abonnement</strong> : contrat par lequel un Membre souscrit une
              formule payante, conclu selon les présentes CGV.
            </li>
            <li>
              <strong className="text-on-surface">Période</strong> : durée d&apos;un cycle de facturation de
              l&apos;abonnement, qui commence à la date de souscription.
            </li>
          </ul>
        </Section>

        <Section id="objet" title="3. Objet et champ d’application">
          <p>
            Les présentes CGV s&apos;appliquent à toute souscription d&apos;un abonnement payant sur le Site. Elles
            complètent les Conditions générales d&apos;utilisation, qui s&apos;appliquent à tous les Membres, abonnés
            ou non. En cas de contradiction, les présentes CGV prévalent pour tout ce qui concerne l&apos;abonnement.
          </p>
          <p>
            Les abonnements sont destinés aux <strong className="text-on-surface">consommateurs</strong>, au sens de
            l&apos;article liminaire du Code de la consommation. Le Membre qui souscrit déclare être majeur, ou
            disposer de l&apos;autorisation de son représentant légal.
          </p>
          <p>
            Le Membre accepte les CGV en cochant la case prévue à cet effet avant le paiement. La version applicable
            est celle en vigueur à la date de souscription. Elle lui est adressée par e-mail avec la confirmation de sa
            souscription.
          </p>
        </Section>

        <Section id="formules" title="4. Formules et limites d’usage">
          <p>
            Les formules payantes donnent accès à des fonctionnalités supplémentaires, notamment : import de recette
            par intelligence artificielle (texte, photo, PDF), ajustement des quantités par intelligence artificielle,
            mode projet assisté par intelligence artificielle, [autres fonctionnalités].
          </p>
          <p>
            Le contenu exact de chaque formule est décrit sur la page <Lien href="/plans">Nos formules</Lien>, qui
            fait partie intégrante de l&apos;offre au moment de la souscription. Certaines fonctionnalités sont
            soumises à une <strong className="text-on-surface">limite d&apos;usage par Période</strong> (par exemple
            un nombre d&apos;imports par intelligence artificielle). Ces limites :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              sont indiquées sur la page <Lien href="/plans">Nos formules</Lien> et dans l&apos;espace Réglages du
              compte → Mon forfait ;
            </li>
            <li>se renouvellent au début de chaque Période ;</li>
            <li>
              ne sont ni reportables d&apos;une Période à l&apos;autre, ni remboursables si elles ne sont pas
              utilisées.
            </li>
          </ul>
        </Section>

        <Section id="essai" title="5. Essai gratuit">
          <p>Certaines formules peuvent être essayées gratuitement pendant [X] jours. L&apos;essai :</p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>ne nécessite aucun moyen de paiement et n&apos;entraîne aucun prélèvement ;</li>
            <li>
              <strong className="text-on-surface">prend fin automatiquement</strong> à son terme. Le compte revient
              alors à la formule gratuite, sauf si le Membre souscrit un abonnement payant ;
            </li>
            <li>est limité à un seul essai par personne ;</li>
            <li>
              peut comporter des limites d&apos;usage inférieures à celles de la formule payante correspondante. Ces
              limites sont indiquées au Membre avant le début de l&apos;essai.
            </li>
          </ul>
        </Section>

        <Section id="prix" title="6. Prix">
          <p>
            Les prix sont indiqués en euros, TVA non applicable (art. 293 B du CGI), sur la page{' '}
            <Lien href="/plans">Nos formules</Lien>, avant toute souscription. Ils s&apos;entendent par Période.
          </p>
          <p>
            Le prix applicable à un abonnement est celui en vigueur au jour de sa souscription. Il est maintenu tant
            que l&apos;abonnement n&apos;est pas résilié.
          </p>
        </Section>

        <Section id="souscription" title="7. Souscription et paiement">
          <p>
            L&apos;abonnement se souscrit en ligne, depuis la page <Lien href="/plans">Nos formules</Lien>, en suivant
            ces étapes :
          </p>
          <ol className="list-decimal pl-5 flex flex-col gap-1.5">
            <li>choix de la formule ;</li>
            <li>acceptation des présentes CGV ;</li>
            <li>demande expresse d&apos;accès immédiat au service (article 11) ;</li>
            <li>paiement.</li>
          </ol>
          <p>
            Le paiement se fait par carte bancaire ou par tout autre moyen proposé au moment de la commande, par
            l&apos;intermédiaire du prestataire de paiement sécurisé <strong className="text-on-surface">Stripe</strong>.
            Les données de paiement sont collectées et traitées directement par Stripe. « Je pâtisse ! » ne stocke
            aucune coordonnée bancaire complète et n&apos;y a pas accès.
          </p>
          <p>
            L&apos;abonnement prend effet dès que le prestataire de paiement a confirmé le paiement. L&apos;activation
            peut prendre quelques instants après le retour sur le Site. Une confirmation de souscription est envoyée
            par e-mail au Membre. Elle reprend les caractéristiques de l&apos;abonnement, les présentes CGV et, le cas
            échéant, sa demande d&apos;accès immédiat au service.
          </p>
        </Section>

        <Section id="duree" title="8. Durée et renouvellement">
          <p>
            L&apos;abonnement est conclu pour une durée d&apos;<strong className="text-on-surface">un mois</strong>. Il
            se renouvelle automatiquement, pour une durée identique, à chaque date anniversaire de la souscription,
            sauf résiliation (article 10). Le prix de chaque nouvelle Période est prélevé automatiquement à son début.
          </p>
        </Section>

        <Section id="changement" title="9. Changement de formule">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              <strong className="text-on-surface">Passage à une formule supérieure</strong> : le changement prend
              effet immédiatement. La différence de prix pour la Période en cours est calculée au prorata du temps
              restant et prélevée aussitôt. Si ce paiement échoue, le changement n&apos;a pas lieu et la formule
              actuelle est conservée.
            </li>
            <li>
              <strong className="text-on-surface">Passage à une formule inférieure</strong> : le changement prend
              effet à la fin de la Période en cours. Le Membre conserve jusque-là les fonctionnalités de sa formule
              actuelle, et aucun remboursement n&apos;est dû.
            </li>
          </ul>
        </Section>

        <Section id="resiliation" title="10. Résiliation par le Membre">
          <p>
            Le Membre peut résilier son abonnement <strong className="text-on-surface">à tout moment</strong>, sans
            frais ni justification, depuis Réglages du compte → Mon forfait, à l&apos;aide de la fonction
            « <strong className="text-on-surface">Résilier mon abonnement</strong> ». Cette fonction est accessible
            directement, sans condition préalable, conformément à l&apos;article L.215-1-1 du Code de la
            consommation.
          </p>
          <p>
            La résiliation prend effet à la <strong className="text-on-surface">fin de la Période en cours</strong>.
            Le Membre conserve jusqu&apos;à cette date les fonctionnalités payées, puis son compte revient à la
            formule gratuite. Sous réserve de l&apos;article 11, les sommes versées pour la Période en cours ne sont
            pas remboursées.
          </p>
          <p>
            Le Membre reçoit par e-mail une <strong className="text-on-surface">confirmation de la résiliation</strong>
            , qui indique la date à laquelle elle prend effet.
          </p>
          <p>
            Le passage à la formule gratuite ne supprime pas le compte et ne supprime aucune recette. Certaines
            fonctionnalités réservées aux formules payantes peuvent toutefois ne plus être accessibles, ou n&apos;être
            accessibles qu&apos;en lecture seule.
          </p>
        </Section>

        <Section id="retractation" title="11. Droit de rétractation">
          <h3 className="font-semibold text-on-surface">11.1 Délai</h3>
          <p>
            Conformément à l&apos;article L.221-18 du Code de la consommation, le Membre dispose d&apos;un délai de{' '}
            <strong className="text-on-surface">quatorze (14) jours</strong> à compter de la souscription pour se
            rétracter, sans avoir à se justifier ni à payer de pénalité. Ce droit s&apos;applique à la souscription
            initiale et à chaque passage à une formule supérieure.
          </p>
          <h3 className="font-semibold text-on-surface">11.2 Accès immédiat au service</h3>
          <p>
            Au moment de la souscription, le Membre peut demander expressément à accéder au service dès la validation
            de son paiement, avant la fin du délai de rétractation. Il conserve alors son droit de rétractation. En
            cas de rétractation, il reste redevable d&apos;un montant proportionnel au service fourni jusqu&apos;à la
            communication de sa décision de se rétracter (article L.221-25 du Code de la consommation).
          </p>
          <h3 className="font-semibold text-on-surface">11.3 Exercice du droit</h3>
          <p>
            Pour exercer ce droit, le Membre adresse avant l&apos;expiration du délai une déclaration dénuée
            d&apos;ambiguïté :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>par e-mail à [contact@jepatisse.com] ;</li>
            <li>ou par courrier à [adresse postale].</li>
          </ul>
          <p>
            Il peut utiliser le <a href="#formulaire-retractation" className="text-primary underline underline-offset-2">
              formulaire type
            </a>{' '}
            figurant en annexe, sans y être obligé.
          </p>
          <h3 className="font-semibold text-on-surface">11.4 Remboursement</h3>
          <p>
            « Je pâtisse ! » rembourse le Membre <strong className="text-on-surface">au plus tard quatorze (14)
            jours</strong> après avoir reçu sa décision de se rétracter. Le montant remboursé est :
          </p>
          <p className="rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface">
            montant payé × (nombre de jours restants dans la Période ÷ nombre de jours de la Période)
          </p>
          <p>
            Le décompte s&apos;arrête à la date de réception de la demande. Le remboursement est effectué sur le moyen
            de paiement utilisé lors de la souscription, sans frais pour le Membre.
          </p>
          <p>
            La rétractation met fin à l&apos;abonnement dès réception de la demande, et le compte revient à la formule
            gratuite.
          </p>
        </Section>

        <Section id="defaut-paiement" title="12. Défaut de paiement">
          <p>
            En cas d&apos;échec d&apos;un prélèvement, le prestataire de paiement effectue automatiquement de
            nouvelles tentatives pendant environ deux semaines. Le Membre en est informé et peut mettre à jour son
            moyen de paiement depuis Réglages du compte.{' '}
            <strong className="text-on-surface">Son accès est maintenu pendant cette période.</strong>
          </p>
          <p>
            Si toutes les tentatives échouent, l&apos;abonnement est résilié de plein droit et le compte revient à la
            formule gratuite.
          </p>
        </Section>

        <Section id="resiliation-editeur" title="13. Suspension ou résiliation par l’éditeur">
          <p>
            En cas de manquement grave du Membre aux Conditions générales d&apos;utilisation (fraude, contournement
            des limites d&apos;usage, atteinte au Site ou à d&apos;autres Membres), « Je pâtisse ! » peut résilier
            l&apos;abonnement après une mise en demeure restée sans effet pendant [15] jours, sauf urgence ou fraude
            avérée. La part du prix correspondant à la Période restant à courir est alors remboursée au prorata, sauf
            en cas de fraude.
          </p>
        </Section>

        <Section id="disponibilite" title="14. Disponibilité et évolution du service">
          <p>
            « Je pâtisse ! » s&apos;efforce d&apos;assurer l&apos;accès au Site en continu. Des interruptions peuvent
            toutefois survenir pour maintenance, mise à jour ou en raison d&apos;événements extérieurs, notamment une
            indisponibilité des prestataires techniques.
          </p>
          <p>
            Les fonctionnalités peuvent évoluer pour améliorer le service. Une modification qui réduit de façon
            significative une fonctionnalité incluse dans la formule souscrite est annoncée au Membre au moins trente
            (30) jours à l&apos;avance. Le Membre peut alors résilier sans frais et obtenir le remboursement au
            prorata de la Période restant à courir, conformément à l&apos;article L.224-25-25 du Code de la
            consommation.
          </p>
        </Section>

        <Section id="ia" title="15. Intelligence artificielle — limites">
          <p>
            Certaines fonctionnalités s&apos;appuient sur des modèles d&apos;intelligence artificielle. Les résultats
            produits (recettes importées, quantités, coefficients d&apos;ajustement, propositions de composants, etc.)
            sont des <strong className="text-on-surface">propositions à vérifier</strong>. Ils peuvent contenir des
            erreurs, notamment de lecture, de quantité ou d&apos;unité.
          </p>
          <p>
            <strong className="text-on-surface">
              Les informations relatives aux allergènes sont fournies à titre indicatif et ne constituent en aucun
              cas une garantie.
            </strong>{' '}
            Il appartient au Membre de vérifier la composition réelle des ingrédients qu&apos;il utilise.
          </p>
        </Section>

        <Section id="garanties" title="16. Garanties légales">
          <p>
            Le Membre bénéficie de la <strong className="text-on-surface">garantie légale de conformité</strong> des
            contenus et services numériques prévue aux articles L.224-25-12 et suivants du Code de la consommation. En
            cas de défaut de conformité, il a droit à la mise en conformité du service ou, à défaut, à une réduction
            du prix ou à la résolution du contrat, dans les conditions prévues par ces articles. Il suffit de le
            signaler à [contact@jepatisse.com].
          </p>
        </Section>

        <Section id="responsabilite" title="17. Responsabilité">
          <p>
            « Je pâtisse ! » est responsable de la bonne exécution de ses obligations dans les conditions du droit
            commun. Sa responsabilité ne peut être engagée en cas de faute du Membre, de fait imprévisible et
            insurmontable d&apos;un tiers, ou de force majeure.
          </p>
          <p>
            Aucune stipulation des présentes CGV ne limite les droits que le Membre tient des dispositions impératives
            du Code de la consommation.
          </p>
        </Section>

        <Section id="facturation" title="18. Facturation">
          <p>
            Une facture est émise pour chaque paiement. Elle est adressée par e-mail et reste consultable depuis
            Réglages du compte → Mon forfait → « Factures et moyen de paiement ».
          </p>
        </Section>

        <Section id="donnees" title="19. Données personnelles">
          <p>
            Les données personnelles collectées lors de la souscription sont traitées conformément à la{' '}
            <Lien href="/confidentialite">Politique de confidentialité</Lien>.
          </p>
        </Section>

        <Section id="reclamations" title="20. Réclamations et médiation">
          <p>
            Toute réclamation peut être adressée à [contact@jepatisse.com], ou depuis le{' '}
            <Lien href="/contact">formulaire de contact</Lien> du Site.
          </p>
          <p>
            À défaut de résolution amiable dans un délai de [deux mois], le Membre peut recourir gratuitement au
            médiateur de la consommation dont relève « Je pâtisse ! » : [nom du médiateur], [adresse postale], [site
            internet].
          </p>
        </Section>

        <Section id="droit-applicable" title="21. Droit applicable et juridiction">
          <p>
            Les présentes CGV sont soumises au droit français. En cas de litige, le Membre consommateur peut saisir, à
            son choix, la juridiction du lieu où il demeurait au moment de la conclusion du contrat, ou celle du lieu
            du fait dommageable (article R.631-3 du Code de la consommation).
          </p>
        </Section>

        <Section id="modification" title="22. Modification des CGV">
          <p>
            « Je pâtisse ! » peut modifier les présentes CGV. La version applicable à un abonnement en cours est celle
            acceptée lors de la souscription. Une nouvelle version ne s&apos;applique à cet abonnement qu&apos;après
            avoir été notifiée au Membre au moins trente (30) jours à l&apos;avance. Pendant ce délai, le Membre peut
            résilier sans frais.
          </p>
        </Section>

        <Section id="formulaire-retractation" title="Annexe — Formulaire de rétractation">
          <p className="italic">
            (Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du
            contrat.)
          </p>
          <div className="rounded-lg border border-outline-variant bg-surface-container-low px-4 py-4 flex flex-col gap-3 text-on-surface">
            <p>
              À l&apos;attention de [Nom ou raison sociale], [adresse postale], [contact@jepatisse.com] :
            </p>
            <p>
              Je vous notifie par la présente ma rétractation du contrat portant sur l&apos;abonnement suivant :
              [formule]
            </p>
            <p>
              Souscrit le : ………………
              <br />
              Nom du Membre : ………………
              <br />
              Adresse e-mail du compte : ………………
              <br />
              Date : ………………
              <br />
              Signature (uniquement en cas de notification sur papier) : ………………
            </p>
          </div>
        </Section>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
