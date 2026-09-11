-- scripts/archive/sql/llx_timeflow_timeentry-add-softdelete.sql
--
-- ARCHIVÉ : retiré du chemin d'auto-chargement de _load_tables() (sorti
-- du préfixe llx_* requis, déplacé de sql/ vers scripts/archive/sql/).
-- Raison : ces colonnes (fk_user_delete, date_delete) font désormais
-- partie directement du CREATE TABLE de base
-- (sql/llx_timeflow_timeentry.sql) — ce script est redondant pour
-- toute install qui utilise la définition de table actuelle.
-- Contrairement à ce que dit le commentaire ci-dessous, ADD COLUMN/
-- ADD INDEX IF NOT EXISTS n'est PAS "safe to run" si la table
-- llx_timeflow_timeentry n'existe pas encore : c'est une vraie erreur
-- SQL (1146 "Table doesn't exist"). Sur une install neuve, l'ordre
-- alphabétique de _load_tables() exécutait ce fichier avant le CREATE
-- TABLE — l'erreur était sans conséquence pour le schéma final
-- (llx_timeflow_timeentry.sql s'exécutait ensuite et créait la table
-- complète), mais ce n'était pas le no-op propre annoncé.
--
-- Ces colonnes ne sont pas cosmétiques : date_delete est le seul
-- mécanisme de suppression "douce" du module (voir
-- TimeEntry::softDeleteRow() dans class/timeentry.class.php) — sans
-- elles, hasDatabaseColumn() désactive la fonctionnalité de
-- suppression standard pour l'install concernée.
--
-- À RÉINTÉGRER MANUELLEMENT (exécuter ce script directement, pas via
-- une réactivation du module) UNIQUEMENT pour mettre à jour une
-- installation ANCIENNE de ce module — créée avant que ces colonnes
-- soient ajoutées au CREATE TABLE de base — dont la table
-- llx_timeflow_timeentry existe déjà mais ne les a jamais reçues.
--
-- Commentaire original :
-- Migration: add soft-delete columns to llx_timeflow_timeentry
-- Adds `date_delete` (datetime) and `fk_user_delete` (int) and an index.
-- Safe to run multiple times thanks to IF NOT EXISTS clauses.

ALTER TABLE llx_timeflow_timeentry
  ADD COLUMN IF NOT EXISTS fk_user_delete INTEGER DEFAULT NULL AFTER fk_user_modif,
  ADD COLUMN IF NOT EXISTS date_delete DATETIME DEFAULT NULL AFTER tms;

-- Add index to speed up queries that filter by date_delete IS NULL
ALTER TABLE llx_timeflow_timeentry
  ADD INDEX IF NOT EXISTS idx_timeflow_timeentry_date_delete (date_delete);

-- Rollback notes (manual)
-- ALTER TABLE llx_timeflow_timeentry DROP INDEX IF EXISTS idx_timeflow_timeentry_date_delete;
-- ALTER TABLE llx_timeflow_timeentry DROP COLUMN IF EXISTS fk_user_delete;
-- ALTER TABLE llx_timeflow_timeentry DROP COLUMN IF EXISTS date_delete;
