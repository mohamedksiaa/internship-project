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
-- BEGIN MODULEBUILDER INDEXES
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_rowid (rowid);
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_fk_user (fk_user);
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_fk_project (fk_project);
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_date_delete (date_delete);
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_date_start (date_start);
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_fk_user_date_start (fk_user, date_start);
-- I1 (SCAL-04/ANO-SCAL-02, RAPPORT_PANNES.md §6) : accelere la recherche
-- timeEntryAlreadyImported() (balayage complet confirme par EXPLAIN, voir
-- RAPPORT_SCALABILITE.md) et ferme le risque de doublon entre deux imports
-- simultanes de la meme ligne. NULL (saisies non importees) n'entre jamais
-- en conflit avec un autre NULL dans un index unique MySQL/MariaDB -- verifie
-- sans doublon sur les 563 saisies de reference avant d'etre propose ici.
-- Si des doublons existent deja sur une installation, cette ligne echoue
-- avec l'erreur MySQL 1062 (DB_ERROR_RECORD_ALREADY_EXISTS) -- un code que
-- Dolibarr tolere SILENCIEUSEMENT a l'activation du module (voir le controle
-- dans admin/setup.php, qui verifie avec SHOW INDEX que la creation a bien
-- reussi).
ALTER TABLE llx_timeflow_timeentry ADD UNIQUE INDEX uk_timeflow_timeentry_import_key (import_key);
-- I2 (SCAL-07) : la file de validation (status = SUBMITTED) balayait l'index
-- date_start en filtrant status a la volee (EXPLAIN : type=index).
ALTER TABLE llx_timeflow_timeentry ADD INDEX idx_timeflow_timeentry_status_date_start (status, date_start);
-- END MODULEBUILDER INDEXES
--ALTER TABLE llx_timeflow_timeentry ADD UNIQUE INDEX uk_timeflow_timeentry_fieldxy(fieldx, fieldy);
--ALTER TABLE llx_timeflow_timeentry ADD CONSTRAINT llx_timeflow_timeentry_fk_field FOREIGN KEY (fk_field) REFERENCES llx_timeflow_myotherobject(rowid);
