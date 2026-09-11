-- ARCHIVÉ : déplacé de sql/ vers scripts/archive/sql/.
-- Raison : le déploiement final de ce module se fait sur une installation
-- Dolibarr NEUVE, jamais une mise à niveau depuis une ancienne
-- installation portant encore le schéma que ce script visait à faire
-- évoluer -- dans ce contexte, ce script ne sert jamais. Il n'était de
-- toute façon jamais dans le chemin d'auto-exécution de l'activation du
-- module : _load_tables('/timeflow/sql/') (core/modules/modTimeFlow.class.php)
-- ne charge que les fichiers sql/llx_*.sql, jamais sql/migrate_*.sql --
-- ce script a toujours été destiné à une exécution manuelle, jamais
-- automatique.
--
-- À RÉINTÉGRER (déplacer ce fichier depuis scripts/archive/sql/ vers
-- sql/) UNIQUEMENT si ce module est un jour installé sur une base
-- pré-existante portant encore l'ancien schéma que ce script vise à
-- faire évoluer -- l'exécuter alors manuellement, en suivant les
-- instructions ci-dessous ; ce script n'a jamais été, et ne redeviendrait
-- pas, auto-exécuté par l'activation du module.

-- Copyright (C) 2026 SuperAdmin
--
-- This program is free software: you can redistribute it and/or modify
-- it under the terms of the GNU General Public License as published by
-- the Free Software Foundation, either version 3 of the License, or
-- (at your option) any later version.
--
-- This program is distributed in the hope that it will be useful,
-- but WITHOUT ANY WARRANTY; without even the implied warranty of
-- MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
-- GNU General Public License for more details.
--
-- You should have received a copy of the GNU General Public License
-- along with this program.  If not, see https://www.gnu.org/licenses/.

-- Step 1 of the TimeFlow -> native llx_projet migration (see the audit
-- "Unification des projets TimeFlow / Dolibarr natif").
--
-- Adds the TimeFlow import key as a standard Dolibarr extrafield
-- on elementtype='projet', using the exact mechanism the extrafields admin
-- screen itself uses: a real column on the companion *_extrafields table,
-- plus a metadata row in llx_extrafields describing it. No core table is
-- restructured — llx_projet_extrafields/llx_extrafields are Dolibarr's own
-- built-in extension points for exactly this purpose.
--
-- Idempotent: safe to run more than once. MariaDB 10.6 supports
-- "ADD COLUMN IF NOT EXISTS"; the llx_extrafields inserts are guarded with
-- a NOT EXISTS check since there is no natural unique key to rely on.

ALTER TABLE llx_projet_extrafields
    ADD COLUMN IF NOT EXISTS timeflow_import_key varchar(14) DEFAULT NULL;

-- entity = 0: extrafield DEFINITIONS are global across entities in
-- Dolibarr's convention (only the per-record VALUES are entity-scoped, via
-- llx_projet's own entity column) — same as how the extrafields admin
-- screen creates them.

INSERT INTO llx_extrafields
    (name, entity, elementtype, label, type, size, fieldunique, fieldrequired,
     alwayseditable, `list`, printable, totalizable, module, pos, datec)
SELECT
    'timeflow_import_key', 0, 'projet', 'Clé d''import TimeFlow', 'varchar', '14', 0, 0,
    1, '0', 0, 0, 'timeflow', 1, NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM llx_extrafields WHERE name = 'timeflow_import_key' AND elementtype = 'projet' AND entity = 0
);

-- Verification queries (read-only, run manually after the above):
-- SHOW COLUMNS FROM llx_projet_extrafields LIKE 'timeflow_%';
-- SELECT name, elementtype, label, type, size FROM llx_extrafields WHERE elementtype = 'projet';
