-- ============================================================
-- SEED — 10 utilisateurs × 5 recettes = 50 recettes de test
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ============================================================

-- ── 1. UTILISATEURS ─────────────────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at
) VALUES
  ('aaaaaaaa-0001-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','marie.dupont@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Marie Dupont","avatar_url":"https://i.pravatar.cc/150?img=1"}','{"provider":"email","providers":["email"]}',NOW() - interval '60 days',NOW()),
  ('aaaaaaaa-0002-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lucas.bernard@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Lucas Bernard","avatar_url":"https://i.pravatar.cc/150?img=3"}','{"provider":"email","providers":["email"]}',NOW() - interval '50 days',NOW()),
  ('aaaaaaaa-0003-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sophie.martin@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Sophie Martin","avatar_url":"https://i.pravatar.cc/150?img=5"}','{"provider":"email","providers":["email"]}',NOW() - interval '45 days',NOW()),
  ('aaaaaaaa-0004-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','thomas.rousseau@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Thomas Rousseau","avatar_url":"https://i.pravatar.cc/150?img=7"}','{"provider":"email","providers":["email"]}',NOW() - interval '40 days',NOW()),
  ('aaaaaaaa-0005-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','camille.lefebvre@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Camille Lefebvre","avatar_url":"https://i.pravatar.cc/150?img=9"}','{"provider":"email","providers":["email"]}',NOW() - interval '35 days',NOW()),
  ('aaaaaaaa-0006-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','antoine.girard@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Antoine Girard","avatar_url":"https://i.pravatar.cc/150?img=11"}','{"provider":"email","providers":["email"]}',NOW() - interval '30 days',NOW()),
  ('aaaaaaaa-0007-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','elise.moreau@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Élise Moreau","avatar_url":"https://i.pravatar.cc/150?img=13"}','{"provider":"email","providers":["email"]}',NOW() - interval '25 days',NOW()),
  ('aaaaaaaa-0008-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hugo.laurent@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Hugo Laurent","avatar_url":"https://i.pravatar.cc/150?img=15"}','{"provider":"email","providers":["email"]}',NOW() - interval '20 days',NOW()),
  ('aaaaaaaa-0009-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','isabelle.fontaine@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Isabelle Fontaine","avatar_url":"https://i.pravatar.cc/150?img=17"}','{"provider":"email","providers":["email"]}',NOW() - interval '15 days',NOW()),
  ('aaaaaaaa-0010-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pierre.mercier@maryseclub.test','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',NOW(),'{"full_name":"Pierre Mercier","avatar_url":"https://i.pravatar.cc/150?img=19"}','{"provider":"email","providers":["email"]}',NOW() - interval '10 days',NOW())
ON CONFLICT (id) DO NOTHING;


-- ── 2. PROFILS ──────────────────────────────────────────────
INSERT INTO profiles (id, full_name, bio, avatar_url) VALUES
  ('aaaaaaaa-0001-0000-0000-000000000000','Marie Dupont',    'Pâtissière amateur passionnée par les tartes fruitées et les entremets légers.',                          'https://i.pravatar.cc/150?img=1'),
  ('aaaaaaaa-0002-0000-0000-000000000000','Lucas Bernard',   'Spécialiste des choux et éclairs, toujours à la recherche de la pâte à choux parfaite.',                 'https://i.pravatar.cc/150?img=3'),
  ('aaaaaaaa-0003-0000-0000-000000000000','Sophie Martin',   'Chef pâtissière de formation, je partage mes créations macarons et entremets chaque semaine.',            'https://i.pravatar.cc/150?img=5'),
  ('aaaaaaaa-0004-0000-0000-000000000000','Thomas Rousseau', 'Accro aux macarons depuis 10 ans, nouvelles saveurs et créations chaque semaine.',                        'https://i.pravatar.cc/150?img=7'),
  ('aaaaaaaa-0005-0000-0000-000000000000','Camille Lefebvre','Passionnée de viennoiseries, mon weekend commence toujours avec des croissants maison.',                   'https://i.pravatar.cc/150?img=9'),
  ('aaaaaaaa-0006-0000-0000-000000000000','Antoine Girard',  'Chocolatier amateur, je travaille le chocolat grand cru et explore la pâtisserie fine.',                  'https://i.pravatar.cc/150?img=11'),
  ('aaaaaaaa-0007-0000-0000-000000000000','Élise Moreau',    'Créatrice de tartelettes artistiques, chaque recette est un tableau comestible.',                         'https://i.pravatar.cc/150?img=13'),
  ('aaaaaaaa-0008-0000-0000-000000000000','Hugo Laurent',    'Amateur de biscuits et gâteaux moelleux, adepte de la pâtisserie de grand-mère modernisée.',              'https://i.pravatar.cc/150?img=15'),
  ('aaaaaaaa-0009-0000-0000-000000000000','Isabelle Fontaine','Confiseure passionnée, je crée des bonbons et confiseries artisanales depuis 5 ans.',                    'https://i.pravatar.cc/150?img=17'),
  ('aaaaaaaa-0010-0000-0000-000000000000','Pierre Mercier',  'Maître pâtissier MOF, je partage les recettes emblématiques de la grande pâtisserie française.',          'https://i.pravatar.cc/150?img=19')
ON CONFLICT (id) DO UPDATE SET
  full_name  = EXCLUDED.full_name,
  bio        = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url;


-- ── 3. RECETTES (50) ────────────────────────────────────────
INSERT INTO recipes (title, description, author_id, type_id, difficulty_id, status, prep_time, total_time, servings, hero_image_url, rating_avg, rating_count, created_at)
SELECT
  v.title,
  v.description,
  v.author_id::uuid,
  (SELECT id FROM recipe_types  WHERE name  = v.type_name  LIMIT 1),
  (SELECT id FROM difficulties  WHERE level = v.diff::int  LIMIT 1),
  'published',
  v.prep::int, v.total::int, v.srv::int,
  v.img,
  v.avg::numeric, v.cnt::int,
  NOW() - (v.ago::int || ' days')::interval
FROM (VALUES
  -- Marie Dupont
  ('Tarte Tatin aux Pommes Caramélisées',    'Une tarte renversée classique, pommes fondantes et caramel doré. Servie tiède avec une boule de glace vanille.',                        'aaaaaaaa-0001-0000-0000-000000000000','Tartes & Tartelettes','2','45','120','8','https://picsum.photos/seed/mc01/800/600','4.5','23','30'),
  ('Tartelette Framboise & Crème Diplomate', 'Fond sablé, crème légère vanille et framboises fraîches en rosace. Fraîcheur garantie.',                                               'aaaaaaaa-0001-0000-0000-000000000000','Tartes & Tartelettes','3','60','180','6','https://picsum.photos/seed/mc02/800/600','4.8','41','25'),
  ('Entremet Passion-Mangue',                'Trois couches : biscuit coco, mousse mangue légère et insert passion gélifié. Enrobage miroir orange.',                                'aaaaaaaa-0001-0000-0000-000000000000','Entremets',           '4','90','300','8','https://picsum.photos/seed/mc03/800/600','4.7','18','20'),
  ('Tarte au Citron Meringuée',              'La classique revisitée : pâte sucrée croustillante, curd citron intense et meringue italienne brûlée à la flamme.',                   'aaaaaaaa-0001-0000-0000-000000000000','Tartes & Tartelettes','3','50','150','8','https://picsum.photos/seed/mc04/800/600','4.9','62','18'),
  ('Tartelette Figue & Miel de Châtaignier', 'Tartelette automnale : frangipane noisette, figues rôties au miel de châtaignier et romarin.',                                         'aaaaaaaa-0001-0000-0000-000000000000','Tartes & Tartelettes','2','40','100','6','https://picsum.photos/seed/mc05/800/600','4.3','15','12'),
  -- Lucas Bernard
  ('Éclairs au Chocolat Noir 70%',           'Éclairs garnis de crème pâtissière Valrhona 70%, glaçage fondant brillant. La recette définitive.',                                   'aaaaaaaa-0002-0000-0000-000000000000','Choux & Éclairs',     '3','60','120','12','https://picsum.photos/seed/mc06/800/600','4.8','55','28'),
  ('Paris-Brest Noisette Pralinée',          'Couronne de pâte à choux, crème mousseline pralinée maison, noisettes torréfiées. Un monument de la pâtisserie française.',          'aaaaaaaa-0002-0000-0000-000000000000','Choux & Éclairs',     '4','90','180','8','https://picsum.photos/seed/mc07/800/600','4.9','38','22'),
  ('Choux à la Crème Vanille Bourbon',       'Petits choux aériens, crème chantilly vanille Bourbon de Madagascar. Simples et irrésistibles.',                                      'aaaaaaaa-0002-0000-0000-000000000000','Choux & Éclairs',     '2','40','90','20','https://picsum.photos/seed/mc08/800/600','4.5','29','16'),
  ('Saint-Honoré Classique',                 'Pâte feuilletée, crème chiboust, choux caramélisés et chantilly. Un chef-d''oeuvre à réaliser chez soi.',                             'aaaaaaaa-0002-0000-0000-000000000000','Choux & Éclairs',     '5','120','300','8','https://picsum.photos/seed/mc09/800/600','4.7','21','35'),
  ('Religieuse Café & Caramel',              'Double chou, crème pâtissière café-caramel, glaçage bicolore. La religieuse revisitée.',                                              'aaaaaaaa-0002-0000-0000-000000000000','Choux & Éclairs',     '4','75','150','8','https://picsum.photos/seed/mc10/800/600','4.6','17','10'),
  -- Sophie Martin
  ('Macarons à la Pistache',                 'Coques vert tendre, ganache montée pistache de Sicile. Authentique, sans colorants artificiels.',                                      'aaaaaaaa-0003-0000-0000-000000000000','Macarons',            '4','90','180','30','https://picsum.photos/seed/mc11/800/600','4.9','73','40'),
  ('Macarons Framboise Litchi Rose',         'La combinaison Ispahan en version macaron : framboise, litchi et rose. Délicatement parfumé.',                                         'aaaaaaaa-0003-0000-0000-000000000000','Macarons',            '4','90','180','30','https://picsum.photos/seed/mc12/800/600','4.8','45','32'),
  ('Bûche de Noël Chocolat-Orange',          'Génoise chocolat, mousse chocolat noir et insert orange-Grand Marnier. La bûche des fêtes.',                                           'aaaaaaaa-0003-0000-0000-000000000000','Entremets',           '4','90','360','10','https://picsum.photos/seed/mc13/800/600','4.7','31','38'),
  ('Charlotte aux Fraises',                  'Biscuits cuillère imbibés, mousse fraises Mara des Bois et coulis fraise-basilic. La douceur de l''été.',                             'aaaaaaaa-0003-0000-0000-000000000000','Entremets',           '3','60','240','8','https://picsum.photos/seed/mc14/800/600','4.6','28','26'),
  ('Vacherin Glacé Vanille-Framboise',       'Meringues croustillantes, glace vanille maison et sorbet framboise. Le dessert estival parfait.',                                      'aaaaaaaa-0003-0000-0000-000000000000','Entremets',           '4','120','480','8','https://picsum.photos/seed/mc15/800/600','4.5','14','20'),
  -- Thomas Rousseau
  ('Macarons Caramel Beurre Salé',           'Macarons dorés, ganache caramel et fleur de sel de Guérande. Le best-seller en version maison.',                                       'aaaaaaaa-0004-0000-0000-000000000000','Macarons',            '3','80','160','30','https://picsum.photos/seed/mc16/800/600','4.9','88','42'),
  ('Macarons Lavande-Miel',                  'Coques violettes, ganache au miel de lavande de Provence. Une recette provençale délicate.',                                            'aaaaaaaa-0004-0000-0000-000000000000','Macarons',            '3','80','160','30','https://picsum.photos/seed/mc17/800/600','4.4','19','35'),
  ('Macarons Citron Basilic',                'Macarons jaune citron, ganache montée citron Meyer et basilic frais. Une fraîcheur incomparable.',                                      'aaaaaaaa-0004-0000-0000-000000000000','Macarons',            '3','80','160','30','https://picsum.photos/seed/mc18/800/600','4.7','33','28'),
  ('Tour de Macarons Multicolores',          '50 macarons en 5 saveurs assemblés en tour pour un buffet de fête. Guide complet inclus.',                                             'aaaaaaaa-0004-0000-0000-000000000000','Macarons',            '5','240','480','50','https://picsum.photos/seed/mc19/800/600','4.8','26','22'),
  ('Macarons Chocolat au Lait Praliné',      'Coques chocolat, ganache Jivara et praliné feuilletine. Croquant et fondant à chaque bouchée.',                                        'aaaaaaaa-0004-0000-0000-000000000000','Macarons',            '3','80','160','30','https://picsum.photos/seed/mc20/800/600','4.8','52','15'),
  -- Camille Lefebvre
  ('Croissants Pur Beurre',                  '72h de travail, 27 couches de feuilletage et beurre AOP. La recette ultime du croissant maison.',                                      'aaaaaaaa-0005-0000-0000-000000000000','Viennoiseries',       '5','240','4320','12','https://picsum.photos/seed/mc21/800/600','4.9','97','45'),
  ('Pain au Chocolat Maison',                'Même pâte feuilletée levée que les croissants, deux barres de chocolat noir. Croustillant dehors, fondant dedans.',                   'aaaaaaaa-0005-0000-0000-000000000000','Viennoiseries',       '4','240','4320','12','https://picsum.photos/seed/mc22/800/600','4.8','64','38'),
  ('Kouign-Amann Breton',                    'Gâteau au beurre breton dans toute sa générosité. Caramel croustillant, intérieur moelleux. Authentique.',                             'aaaaaaaa-0005-0000-0000-000000000000','Viennoiseries',       '3','30','180','8','https://picsum.photos/seed/mc23/800/600','4.9','81','30'),
  ('Brioche Feuilletée',                     'Brioche avec un tourage beurré pour une texture entre brioche et croissant. Le brunch du weekend.',                                     'aaaaaaaa-0005-0000-0000-000000000000','Viennoiseries',       '4','60','600','10','https://picsum.photos/seed/mc24/800/600','4.7','43','24'),
  ('Cannelés Bordelais',                     'Moelleux dedans, caramélisés et croustillants dehors. Recette traditionnelle avec rhum et vanille.',                                   'aaaaaaaa-0005-0000-0000-000000000000','Viennoiseries',       '3','30','1440','12','https://picsum.photos/seed/mc25/800/600','4.8','59','18'),
  -- Antoine Girard
  ('Truffes au Chocolat Noir Pur Cacao',     'Ganache Valrhona Guanaja 70%, roulées dans le cacao pur. La truffe dans sa forme la plus authentique.',                                'aaaaaaaa-0006-0000-0000-000000000000','Bonbons & Chocolats', '2','30','120','30','https://picsum.photos/seed/mc26/800/600','4.7','36','32'),
  ('Mendiants aux Fruits Secs',              'Disques de chocolat noir tempéré, pistaches, amandes, cranberries et orange confite. Parfaits pour les fêtes.',                        'aaaaaaaa-0006-0000-0000-000000000000','Bonbons & Chocolats', '2','45','90','24','https://picsum.photos/seed/mc27/800/600','4.5','28','25'),
  ('Tablette Chocolat Caramel Fleur de Sel', 'Chocolat noir 66% coulé en tablette, streusel caramel et éclats de fleur de sel. Simple et addictif.',                                 'aaaaaaaa-0006-0000-0000-000000000000','Bonbons & Chocolats', '3','60','180','8','https://picsum.photos/seed/mc28/800/600','4.8','47','20'),
  ('Rochers Praliné Feuilletine',            'Coeur de praliné noisette, enrobage chocolat au lait, croustillant feuilletine. Le rocher artisanal.',                                 'aaaaaaaa-0006-0000-0000-000000000000','Bonbons & Chocolats', '3','60','120','24','https://picsum.photos/seed/mc29/800/600','4.9','53','14'),
  ('Ganache Pistache-Framboise',             'Bonbons chocolat noir, ganache pistache de Bronte avec coeur framboise. Accord sophistiqué et équilibré.',                             'aaaaaaaa-0006-0000-0000-000000000000','Bonbons & Chocolats', '4','90','240','20','https://picsum.photos/seed/mc30/800/600','4.6','22','8'),
  -- Élise Moreau
  ('Tartelette Poire & Amande',              'Fond sablé, crème amande dorée, poires Williams pochées au safran. Toute en élégance.',                                                'aaaaaaaa-0007-0000-0000-000000000000','Tartes & Tartelettes','2','50','120','6','https://picsum.photos/seed/mc31/800/600','4.6','31','28'),
  ('Tartelette Chocolat Gianduja',           'Pâte sablée cacao, ganache gianduja maison, éclats de noisettes torréfiées. Intense et gourmande.',                                    'aaaaaaaa-0007-0000-0000-000000000000','Tartes & Tartelettes','3','60','150','6','https://picsum.photos/seed/mc32/800/600','4.8','44','22'),
  ('Tartelette Abricot & Romarin',           'Fond amande, crème de romarin, abricots rôtis au miel. La Provence dans une tartelette.',                                              'aaaaaaaa-0007-0000-0000-000000000000','Tartes & Tartelettes','2','40','100','6','https://picsum.photos/seed/mc33/800/600','4.5','19','18'),
  ('Tartelette Praliné Noisette',            'Fond croustillant feuilletine, ganache praliné noisette, mousse légère et noisettes caramélisées.',                                    'aaaaaaaa-0007-0000-0000-000000000000','Tartes & Tartelettes','3','70','180','6','https://picsum.photos/seed/mc34/800/600','4.9','58','14'),
  ('Tartelette Coco-Passion',                'Fond tendre noix de coco, crème passion-yuzu et meringue italienne torchée. Saveurs exotiques et soleil.',                             'aaaaaaaa-0007-0000-0000-000000000000','Tartes & Tartelettes','3','60','150','6','https://picsum.photos/seed/mc35/800/600','4.7','27','10'),
  -- Hugo Laurent
  ('Financiers à la Noisette Brune',         'Beurre noisette, poudre de noisettes, blancs montés. Ces financiers surpassent ceux de la boulangerie.',                              'aaaaaaaa-0008-0000-0000-000000000000','Biscuits & Moelleux', '1','15','35','20','https://picsum.photos/seed/mc36/800/600','4.7','84','35'),
  ('Madeleines Citron Pavot',                'Madeleines légères avec leur bosse, parfumées au citron de Menton et graines de pavot.',                                               'aaaaaaaa-0008-0000-0000-000000000000','Biscuits & Moelleux', '1','15','40','24','https://picsum.photos/seed/mc37/800/600','4.8','91','28'),
  ('Sablés Viennois Beurre',                 'Sablés au beurre doux, pochés à la douille cannelée. Fondants, délicats, irrésistibles avec un thé.',                                 'aaaaaaaa-0008-0000-0000-000000000000','Biscuits & Moelleux', '1','20','50','30','https://picsum.photos/seed/mc38/800/600','4.6','67','22'),
  ('Cake Marbré Chocolat-Vanille',           'Cake marbré classique avec un ruban parfait. La recette inratable pour les goûters de famille.',                                       'aaaaaaaa-0008-0000-0000-000000000000','Biscuits & Moelleux', '1','20','80','8','https://picsum.photos/seed/mc39/800/600','4.5','102','16'),
  ('Brownie Fondant Noix de Pécan',          'Brownie ultra fondant au chocolat noir, noix de pécan et fleur de sel. Texture parfaite entre fondant et moelleux.',                  'aaaaaaaa-0008-0000-0000-000000000000','Biscuits & Moelleux', '1','15','45','12','https://picsum.photos/seed/mc40/800/600','4.9','136','10'),
  -- Isabelle Fontaine
  ('Guimauve Framboise Enrobée Chocolat',    'Guimauves aériennes framboise, enrobées de chocolat noir. Un bonbon artisanal qui fait l''unanimité.',                                 'aaaaaaaa-0009-0000-0000-000000000000','Bonbons & Chocolats', '3','45','120','30','https://picsum.photos/seed/mc41/800/600','4.7','38','30'),
  ('Caramels Mous Fleur de Sel',             'Caramels au beurre salé, texture fondante parfaite. Conditionnés en papier, ils font de beaux cadeaux.',                              'aaaaaaaa-0009-0000-0000-000000000000','Bonbons & Chocolats', '2','30','120','40','https://picsum.photos/seed/mc42/800/600','4.8','62','25'),
  ('Pâte de Fruit à la Mangue-Passion',      'Pâte de fruit mangue-passion roulée dans le sucre cristal. La confiserie artisanale que tout le monde adore.',                        'aaaaaaaa-0009-0000-0000-000000000000','Bonbons & Chocolats', '3','30','180','40','https://picsum.photos/seed/mc43/800/600','4.6','29','18'),
  ('Bonbons Chocolat Ganache Yuzu',          'Coques chocolat noir, ganache yuzu acidulée. Une création qui surprend et séduit les palais exigeants.',                               'aaaaaaaa-0009-0000-0000-000000000000','Bonbons & Chocolats', '4','90','240','24','https://picsum.photos/seed/mc44/800/600','4.9','41','12'),
  ('Nougat Blanc aux Pistaches',             'Nougat de Montélimar maison, pistaches entières et miel acacia. La confiserie provençale dans toute sa splendeur.',                   'aaaaaaaa-0009-0000-0000-000000000000','Bonbons & Chocolats', '4','60','720','20','https://picsum.photos/seed/mc45/800/600','4.7','24','8'),
  -- Pierre Mercier
  ('Opéra Classique',                        'Joconde imbibée café, ganache chocolat, crème au beurre café. Le gâteau emblématique de la grande pâtisserie parisienne.',            'aaaaaaaa-0010-0000-0000-000000000000','Entremets',           '5','180','420','10','https://picsum.photos/seed/mc46/800/600','4.9','47','40'),
  ('Fraisier Moderne',                       'Génoise, crème mousseline vanille, fraises gariguette en coupe nette. Élégance à la française.',                                       'aaaaaaaa-0010-0000-0000-000000000000','Entremets',           '4','120','300','8','https://picsum.photos/seed/mc47/800/600','4.8','53','32'),
  ('Millefeuille Vanille Bourbon',           'Feuilletage caramélisé, crème vanille Bourbon de Madagascar, fondant blanc craquelé. Le millefeuille de référence.',                  'aaaaaaaa-0010-0000-0000-000000000000','Tartes & Tartelettes','5','120','300','8','https://picsum.photos/seed/mc48/800/600','4.9','69','28'),
  ('Tarte Bourdaloue aux Poires',            'Fond de tarte, frangipane fine, poires pochées et gelée de poire. La grande classique de la pâtisserie traditionnelle.',             'aaaaaaaa-0010-0000-0000-000000000000','Tartes & Tartelettes','3','60','180','8','https://picsum.photos/seed/mc49/800/600','4.7','34','20'),
  ('Mont-Blanc aux Marrons',                 'Meringue, chantilly légère, vermicelles de châtaigne au rhum. Le classique automne-hiver dans toute sa générosité.',                  'aaaaaaaa-0010-0000-0000-000000000000','Entremets',           '4','90','240','6','https://picsum.photos/seed/mc50/800/600','4.8','44','12')

) AS v(title, description, author_id, type_name, diff, prep, total, srv, img, avg, cnt, ago);
