#!/usr/bin/env bash
set -euo pipefail

SQL_FILE="$(dirname "$0")/migrate_remove_residual_clockify.sql"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/backup_timeflow_before_fix_${TIMESTAMP}.sql"
LOG_DIR="/tmp/timeflow_migration_logs_${TIMESTAMP}"
mkdir -p "$LOG_DIR"

echo "Migration helper: remove residual Clockify -> TimeFlow"
echo "This script will:"
echo " - Ask for DB credentials, create a mysqldump backup"
echo " - Run: $SQL_FILE"
echo " - Save SELECT verification outputs into $LOG_DIR"
echo " - Optionally empty Dolibarr caches (will ask for confirmation)"

read -p "Database host (default: localhost): " DB_HOST
DB_HOST=${DB_HOST:-localhost}
read -p "Database port (default: 3306): " DB_PORT
DB_PORT=${DB_PORT:-3306}
read -p "Database name (e.g. dolibarr): " DB_NAME
read -p "Database user (e.g. dolibarr): " DB_USER
read -s -p "Database password: " DB_PASS
echo

if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: SQL file not found: $SQL_FILE"
  exit 1
fi

export MYSQL_PWD="$DB_PASS"

echo "Creating mysqldump backup to $BACKUP_FILE (this may take a while)..."
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --single-transaction --routines --events --triggers --hex-blob --default-character-set=utf8mb4 "$DB_NAME" > "$BACKUP_FILE"

echo "Checking precondition: MAIN_MODULE_TIMEFLOW must equal '1' before destructive changes."
MAIN_MOD_VAL=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -e "SELECT value FROM llx_const WHERE name='MAIN_MODULE_TIMEFLOW' LIMIT 1" "$DB_NAME" 2>/dev/null || true)
echo "Detected MAIN_MODULE_TIMEFLOW value: '$MAIN_MOD_VAL'" > "$LOG_DIR/precheck.out"
if [ "$MAIN_MOD_VAL" != "1" ]; then
  echo "Precheck failed: MAIN_MODULE_TIMEFLOW is not '1'. Aborting migration. See $LOG_DIR/precheck.out for details."
  echo "Current MAIN_MODULE_* rows:" > "$LOG_DIR/precheck_details.out"
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT * FROM llx_const WHERE name IN ('MAIN_MODULE_TIMEFLOW','MAIN_MODULE_CLOCKIFY');" "$DB_NAME" >> "$LOG_DIR/precheck_details.out" 2>&1 || true
  echo "Aborting. No changes made. Restore from backup if needed." 
  unset MYSQL_PWD
  exit 2
fi

echo "Running migration SQL: $SQL_FILE (logs in $LOG_DIR/migration.out)"
# Detect primary key column used by llx_rights_def (common names: rowid, id)
RIGHTS_COL=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='llx_rights_def' AND COLUMN_NAME IN ('rowid','id') LIMIT 1" "$DB_NAME" 2>/dev/null || true)
if [ -z "$RIGHTS_COL" ]; then
  echo "Warning: could not detect 'rowid' or 'id' column in llx_rights_def. Defaulting to 'rowid' and hoping it's present." | tee -a "$LOG_DIR/migration.out"
  RIGHTS_COL='rowid'
fi

echo "Detected rights_def PK column: $RIGHTS_COL" >> "$LOG_DIR/migration.out"

# Clean referencing tables llx_user_rights and llx_usergroup_rights if they exist
echo "Checking for referencing user rights tables and deleting references if present..." >> "$LOG_DIR/migration.out"

# Function to detect column and delete references
delete_references() {
  local TABLE_NAME="$1"
  local LOGFILE="$2"
  # check table exists
  local exists=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${TABLE_NAME}'" "$DB_NAME" 2>/dev/null || echo 0)
  if [ "$exists" -eq 0 ]; then
    echo "Table ${TABLE_NAME} not present; skipping." >> "$LOGFILE"
    return
  fi
  # try common fk column names
  local fkcol=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${TABLE_NAME}' AND COLUMN_NAME IN ('fk_rights_def','fk_rights','fk_right') LIMIT 1" "$DB_NAME" 2>/dev/null || true)
  if [ -z "$fkcol" ]; then
    echo "No common FK column found in ${TABLE_NAME}; skipping." >> "$LOGFILE"
    return
  fi
  echo "Found FK column ${fkcol} in ${TABLE_NAME}; counting references..." >> "$LOGFILE"
  local cnt=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -e "SELECT COUNT(*) FROM ${TABLE_NAME} WHERE \\`${fkcol}\\` IN (50000001,50000002,50000003,50000004,50000005,50000006)" "$DB_NAME" 2>/dev/null || echo 0)
  echo "References to remove in ${TABLE_NAME}: ${cnt}" >> "$LOGFILE"
  if [ "$cnt" -gt 0 ]; then
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "DELETE FROM ${TABLE_NAME} WHERE \\`${fkcol}\\` IN (50000001,50000002,50000003,50000004,50000005,50000006)" "$DB_NAME" >> "$LOGFILE" 2>&1 || true
    echo "Deleted ${cnt} rows from ${TABLE_NAME}" >> "$LOGFILE"
  fi
}

delete_references "llx_user_rights" "$LOG_DIR/migration.out"
delete_references "llx_usergroup_rights" "$LOG_DIR/migration.out"

TMP_SQL="${LOG_DIR}/migrate_tmp_$$.sql"
sed "s/__RK__/${RIGHTS_COL}/g" "$SQL_FILE" > "$TMP_SQL"

# Run SQL and capture stdout/stderr
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" < "$TMP_SQL" > "$LOG_DIR/migration.out" 2>"$LOG_DIR/migration.err" || {
  echo "Migration failed. See $LOG_DIR/migration.err and $LOG_DIR/migration.out"
  unset MYSQL_PWD
  rm -f "$TMP_SQL"
  exit 1
}
rm -f "$TMP_SQL"

# Run final verification SELECTs and save outputs
echo "Saving verification SELECT outputs into $LOG_DIR"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT * FROM llx_const WHERE name LIKE '%CLOCKIFY%' OR name = 'MAIN_MODULE_CLOCKIFY' OR name LIKE '%TIMEFLOW_%';" "$DB_NAME" > "$LOG_DIR/verify_llx_const.tsv"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT rowid, mainmenu, module, url, titre, langs, position FROM llx_menu WHERE mainmenu = 'clockify' OR url LIKE '%/clockify/%' OR langs LIKE '%clockify@clockify%' OR titre LIKE '%ModuleClockifyName%' OR mainmenu = 'timeflow' OR langs LIKE '%timeflow@timeflow%' OR url LIKE '%/timeflow/%' ORDER BY rowid;" "$DB_NAME" > "$LOG_DIR/verify_llx_menu.tsv"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT * FROM llx_rights_def WHERE module = 'clockify' OR module = 'timeflow' OR ${RIGHTS_COL} IN (50000001,50000002,50000003,50000004,50000005,50000006);" "$DB_NAME" > "$LOG_DIR/verify_llx_rights_def.tsv"

echo "Migration and verification finished. Logs and outputs are in: $LOG_DIR"

echo "Do you want to clear Dolibarr caches now? This will rm -rf the cache directories (must be run as the webserver user)."
read -p "Clear caches? (y/N): " CLEAR_CACHE
if [[ "$CLEAR_CACHE" =~ ^[Yy]$ ]]; then
  # Try to detect DOL_DATA_ROOT from conf.php
  CONF_PHP="/usr/share/dolibarr/htdocs/conf/conf.php"
  if [ -f "$CONF_PHP" ]; then
    DOL_DATA_ROOT=$(php -r "require '$CONF_PHP'; echo isset(\$dolibarr_main_data_root)?trim(\$dolibarr_main_data_root):'';")
    echo "Detected DOL_DATA_ROOT=$DOL_DATA_ROOT"
  else
    DOL_DATA_ROOT=""
  fi

  echo "Cache directories to inspect:" 
  echo " - $DOL_DATA_ROOT/cache"
  echo " - /usr/share/dolibarr/htdocs/cache"
  read -p "Proceed to remove files in these directories? (you will be prompted for sudo if needed) (y/N): " PROCEED
  if [[ "$PROCEED" =~ ^[Yy]$ ]]; then
    if [ -n "$DOL_DATA_ROOT" ] && [ -d "$DOL_DATA_ROOT/cache" ]; then
      sudo -u www-data rm -rf "$DOL_DATA_ROOT/cache/*" || true
    fi
    if [ -d "/usr/share/dolibarr/htdocs/cache" ]; then
      sudo -u www-data rm -rf "/usr/share/dolibarr/htdocs/cache/*" || true
    fi
    echo "Cache directories cleaned (if they existed)."
  else
    echo "Skipping cache removal."
  fi
else
  echo "Skipping cache removal. You can clear caches from UI: Accueil > Outils Admin > Vider les caches"
fi

unset MYSQL_PWD

echo "All done. Check $LOG_DIR for detailed outputs. If anything unexpected occurred, restore DB from: $BACKUP_FILE"
exit 0
