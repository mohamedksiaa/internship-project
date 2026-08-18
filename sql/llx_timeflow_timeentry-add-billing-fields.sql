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
-- Adds hourly-rate/amount/invoice-link columns for installs that were
-- created before billing support was added. Safe to re-run: uses
-- IF NOT EXISTS so it is a no-op on fresh installs where the base
-- llx_timeflow_timeentry.sql script already created these columns.

ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS thm double(24,8) DEFAULT NULL;
ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS amount double(24,8) DEFAULT NULL;
ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS fk_facture integer DEFAULT NULL;
ALTER TABLE llx_timeflow_timeentry ADD COLUMN IF NOT EXISTS date_invoice datetime DEFAULT NULL;
