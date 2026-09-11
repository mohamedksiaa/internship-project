-- Copyright (C) 2026		SuperAdmin
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
--
-- ARCHIVÉ : retiré du chemin d'auto-chargement de _load_tables() (sorti
-- du préfixe llx_* requis, déplacé de sql/ vers scripts/archive/sql/).
-- Raison : ces colonnes (thm, amount, fk_facture, date_invoice) font
-- désormais partie directement du CREATE TABLE de base
-- (sql/llx_timeflow_timeentry.sql) — ce script est redondant pour
-- toute install qui utilise la définition de table actuelle.
-- Contrairement à ce que dit le commentaire ci-dessous, ADD COLUMN
-- IF NOT EXISTS n'est PAS un no-op silencieux si la table
-- llx_timeflow_timeentry n'existe pas encore : c'est une vraie erreur
-- SQL (1146 "Table doesn't exist"). Sur une install neuve, l'ordre
-- alphabétique de _load_tables() exécutait ce fichier avant le CREATE
-- TABLE — l'erreur était sans conséquence pour le schéma final
-- (llx_timeflow_timeentry.sql s'exécutait ensuite et créait la table
-- complète), mais ce n'était pas le no-op propre que le commentaire
-- original annonçait.
--
-- À RÉINTÉGRER MANUELLEMENT (exécuter ce script directement, pas via
-- une réactivation du module) UNIQUEMENT pour mettre à jour une
-- installation ANCIENNE de ce module — créée avant que ces colonnes
-- soient ajoutées au CREATE TABLE de base — dont la table
-- llx_timeflow_timeentry existe déjà mais ne les a jamais reçues.
--
-- Commentaire original :
-- Adds hourly-rate/amount/invoice-link columns for installs that were
-- created before billing support was added. Safe to re-run: uses
-- IF NOT EXISTS so it is a no-op on fresh installs where the base
-- llx_timeflow_timeentry.sql script already created these columns.

ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS thm double(24,8) DEFAULT NULL;
ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS amount double(24,8) DEFAULT NULL;
ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS fk_facture integer DEFAULT NULL;
ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS date_invoice datetime DEFAULT NULL;
