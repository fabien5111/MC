'use client';

// Liste d'articles cochables (porté de courses.html).
// La coche est optimiste puis persistée via le client Supabase navigateur
// (RLS appliquée par la session partagée en cookies) — équivalent de
// setShoppingItemChecked() du db.js vanilla.
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ShoppingItem } from '@/lib/shopping';

export function ShoppingItems({ initialItems }: { initialItems: ShoppingItem[] }) {
  const sorted = useMemo(
    () => [...initialItems].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')),
    [initialItems],
  );
  const [items, setItems] = useState(sorted);

  const total = items.length;
  const done = items.filter((i) => i.checked).length;

  async function toggle(id: number, checked: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked } : i)));
    const supabase = createClient();
    const { error } = await supabase.from('shopping_list_items').update({ checked }).eq('id', id);
    if (error) {
      // Rollback si l'enregistrement échoue.
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !checked } : i)));
      alert('Coche non enregistrée : ' + error.message);
    }
  }

  if (total === 0) {
    return <p className="text-on-surface-variant italic">Cette liste est vide.</p>;
  }

  return (
    <>
      <p className="font-label-md text-label-md text-on-surface-variant mb-4">
        {total} article{total > 1 ? 's' : ''}
        {done ? ` · ${done} coché${done > 1 ? 's' : ''}` : ''}
      </p>
      <ul className="flex flex-col">
        {items.map((i) => {
          const qty = [i.quantity, i.unit].filter(Boolean).join(' ');
          const struck = i.checked ? 'line-through opacity-50' : '';
          return (
            <li key={i.id} className="flex items-center gap-4 py-3 border-b border-outline-variant/30">
              <input
                type="checkbox"
                checked={i.checked}
                onChange={(e) => toggle(i.id, e.target.checked)}
                className="w-5 h-5 rounded border-outline text-primary focus:ring-primary cursor-pointer shrink-0"
              />
              <span className={`font-body-md text-body-md flex-1 ${struck}`}>{i.name}</span>
              <span className={`font-label-md text-label-md text-primary whitespace-nowrap ${struck}`}>
                {qty}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
