#!/bin/bash

# Backup script for Event Access Control System
# Run daily via cron: 0 2 * * * /path/to/backup.sh
# Optional: set BACKUP_GPG_RECIPIENT to encrypt the dump with that GPG key.

set -euo pipefail
umask 077   # backups contain personal data: owner-only permissions

: "${DATABASE_URL:?DATABASE_URL must be set}"

BACKUP_DIR="${BACKUP_DIR:-/home/youruser/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="event_access_backup_$TIMESTAMP"
OUT="$BACKUP_DIR/${BACKUP_NAME}.sql.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Never leave a partial dump behind if something fails
trap 'rm -f "$OUT" "$OUT.gpg"' ERR

echo "Starting backup: $BACKUP_NAME"
pg_dump --no-owner "$DATABASE_URL" | gzip > "$OUT"

if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$OUT.gpg" "$OUT"
  rm -f "$OUT"
  OUT="$OUT.gpg"
fi

# A backup that cannot be read back is not a backup
if [ ! -s "$OUT" ]; then
  echo "Backup is empty" >&2
  exit 1
fi

echo "Cleaning backups older than 7 days..."
find "$BACKUP_DIR" -name "event_access_backup_*" -mtime +7 -delete

# Optional: upload to cloud storage (uncomment and configure)
# aws s3 cp "$OUT" s3://your-backup-bucket/
# rclone copy "$OUT" remote:backups/

echo "Backup completed: $OUT"
