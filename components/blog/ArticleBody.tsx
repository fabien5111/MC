// Rendu du corps d'un article — Server Component.
//
// Le contenu est un document ProseMirror (arbre produit par TipTap) stocké en
// `jsonb`, pas du HTML : il n'y a donc rien à désinfecter ici, et surtout rien
// à interpréter avec `dangerouslySetInnerHTML`. Chaque type de nœud connu est
// rendu explicitement ; un nœud inconnu est ignoré plutôt que rendu au hasard.
//
// Les ancres des titres sont calculées en une passe par `buildHeadingIds` et
// indexées par identité de nœud : le corps et le sommaire lisent la même table,
// sans dépendre de l'ordre dans lequel React évalue les composants.
import Link from 'next/link';
import { buildHeadingIds, type ProseDoc, type ProseNode } from '@/lib/blog-content';

// Marques de texte. `link` est traitée à part (elle produit un élément).
function applyMarks(node: ProseNode, key: string): React.ReactNode {
  let out: React.ReactNode = node.text ?? '';

  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong className="font-semibold text-on-surface">{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'code')
      out = <code className="bg-surface-container px-1.5 py-0.5 rounded text-[0.9em]">{out}</code>;
  }

  const link = (node.marks ?? []).find((m) => m.type === 'link');
  if (link) {
    const href = String(link.attrs?.href ?? '');
    const external = /^https?:\/\//i.test(href);
    out = (
      <a
        href={href}
        className="text-primary underline underline-offset-2 hover:text-secondary transition-colors"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {out}
      </a>
    );
  }

  return <span key={key}>{out}</span>;
}

function renderInline(nodes: ProseNode[] | undefined, keyPrefix: string): React.ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    if (n.type === 'hardBreak') return <br key={key} />;
    return applyMarks(n, key);
  });
}

// Encadré « renvoi vers une recette » — nœud d'éditeur, pas un lien saisi à la
// main : c'est ce qui garantit que le renvoi pointe vers une recette existante
// et qu'il reste repérable dans le document.
function RecipeCallout({ node }: { node: ProseNode }) {
  const recipeId = String(node.attrs?.recipeId ?? '');
  const title = String(node.attrs?.title ?? 'Voir la recette');
  const note = String(node.attrs?.note ?? '');
  if (!recipeId) return null;

  return (
    <div className="bg-surface-container-low border border-outline-variant/60 p-6 my-10 flex gap-4 items-start rounded-xl">
      <span className="material-symbols-outlined text-primary text-[24px] shrink-0">menu_book</span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-primary mb-1">Passer à la pratique</p>
        {note && <p className="text-[14px] leading-relaxed text-on-surface-variant mb-3">{note}</p>}
        <Link
          href={`/recette/${recipeId}`}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-secondary"
        >
          {title} <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}

function ArticleImage({ node }: { node: ProseNode }) {
  const src = String(node.attrs?.src ?? '');
  const alt = String(node.attrs?.alt ?? '');
  const caption = String(node.attrs?.caption ?? '');
  if (!src) return null;

  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-xl bg-surface-container">
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL (les
            images du site sont stockées en base, pas dans un bucket) */}
        <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
      </div>
      {caption && (
        <figcaption className="text-[12.5px] text-outline mt-2 text-center">{caption}</figcaption>
      )}
    </figure>
  );
}

function Table({ node, ids }: { node: ProseNode; ids: Map<ProseNode, string> }) {
  return (
    <div className="border border-outline-variant overflow-x-auto my-6 rounded-xl">
      <table className="w-full text-[14px]">
        <tbody className="text-on-surface-variant">
          {(node.content ?? []).map((row, r) => (
            <tr key={r} className={r > 0 ? 'border-t border-outline-variant/60' : 'bg-surface-container'}>
              {(row.content ?? []).map((cell, c) => {
                const Cell = cell.type === 'tableHeader' ? 'th' : 'td';
                return (
                  <Cell
                    key={c}
                    className={
                      cell.type === 'tableHeader'
                        ? 'px-4 py-3 font-semibold text-primary text-left'
                        : 'px-4 py-3 align-top'
                    }
                  >
                    {(cell.content ?? []).map((child, i) => (
                      <BlockNode key={i} node={child} ids={ids} bare />
                    ))}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// `bare` : à l'intérieur d'une cellule ou d'une puce, un paragraphe ne porte ni
// marge basse ni taille propre — il hérite du conteneur.
function BlockNode({
  node,
  ids,
  bare = false,
}: {
  node: ProseNode;
  ids: Map<ProseNode, string>;
  bare?: boolean;
}): React.ReactElement | null {
  switch (node.type) {
    case 'paragraph': {
      const inline = renderInline(node.content, 'p');
      if (bare) return <>{inline}</>;
      return (
        <p className="text-[16.5px] leading-[1.75] text-[#3a2f30] mb-[18px]">{inline}</p>
      );
    }

    case 'heading': {
      const level = Number(node.attrs?.level ?? 2);
      // Seuls les H2/H3 sont ancrés : ce sont ceux que reprend le sommaire.
      // Un titre vide n'a pas d'entrée dans la table, donc pas d'ancre.
      const id = ids.get(node);
      if (level === 2) {
        return (
          <h2
            id={id}
            className="font-headline-lg text-[27px] font-bold text-primary mt-14 mb-4 scroll-mt-[110px]"
          >
            {renderInline(node.content, 'h2')}
          </h2>
        );
      }
      if (level === 3) {
        return (
          <h3
            id={id}
            className="font-headline-lg text-[20px] font-semibold text-primary mt-9 mb-3 scroll-mt-[110px]"
          >
            {renderInline(node.content, 'h3')}
          </h3>
        );
      }
      return (
        <p className="font-headline-lg text-[18px] font-semibold text-primary mt-6 mb-2">
          {renderInline(node.content, 'h')}
        </p>
      );
    }

    case 'bulletList':
      return (
        <ul className="mb-[18px]">
          {(node.content ?? []).map((li, i) => (
            <li
              key={i}
              className="text-[16.5px] leading-[1.7] text-[#3a2f30] mb-[9px] pl-5 relative before:content-[''] before:absolute before:left-0.5 before:top-3 before:w-[5px] before:h-[5px] before:rounded-full before:bg-outline"
            >
              {(li.content ?? []).map((child, j) => (
                <BlockNode key={j} node={child} ids={ids} bare />
              ))}
            </li>
          ))}
        </ul>
      );

    case 'orderedList':
      return (
        <ol className="mb-[18px] list-decimal pl-6 marker:text-outline">
          {(node.content ?? []).map((li, i) => (
            <li key={i} className="text-[16.5px] leading-[1.7] text-[#3a2f30] mb-[9px] pl-1">
              {(li.content ?? []).map((child, j) => (
                <BlockNode key={j} node={child} ids={ids} bare />
              ))}
            </li>
          ))}
        </ol>
      );

    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-primary pl-5 my-7 text-[16.5px] leading-[1.7] text-on-surface-variant italic">
          {(node.content ?? []).map((child, i) => (
            <BlockNode key={i} node={child} ids={ids} bare />
          ))}
        </blockquote>
      );

    case 'table':
      return <Table node={node} ids={ids} />;

    case 'image':
      return <ArticleImage node={node} />;

    case 'recipeLink':
      return <RecipeCallout node={node} />;

    case 'horizontalRule':
      return <hr className="my-10 border-outline-variant/60" />;

    case 'codeBlock':
      return (
        <pre className="bg-surface-container rounded-xl p-4 my-6 overflow-x-auto text-[13.5px]">
          <code>{(node.content ?? []).map((c) => c.text ?? '').join('')}</code>
        </pre>
      );

    // Nœud inconnu : ignoré. Mieux vaut un blanc qu'un rendu inventé.
    default:
      return null;
  }
}

export function ArticleBody({ doc }: { doc: ProseDoc }) {
  const ids = buildHeadingIds(doc);
  return (
    <article className="max-w-[68ch] order-2 lg:order-1">
      {(doc.content ?? []).map((node, i) => (
        <BlockNode key={i} node={node} ids={ids} />
      ))}
    </article>
  );
}
