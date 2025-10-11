#!/bin/bash

# Backup script for Event Access Control System
# Run daily via cron: 0 2 * * * /path/to/backup.sh

set -e

BACKUP_DIR="/home/youruser/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="event_access_backup_$TIMESTAMP"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Starting backup: $BACKUP_NAME"

# Database backup (PostgreSQL)
echo "Backing up database..."
pg_dump "$DATABASE_URL" > "$BACKUP_DIR/${BACKUP_NAME}_db.sql"

# Compress backup
echo "Compressing backup..."
tar -czf "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" -C "$BACKUP_DIR" "${BACKUP_NAME}_db.sql"

# Remove uncompressed file
rm "$BACKUP_DIR/${BACKUP_NAME}_db.sql"

# Keep only last 7 days of backups
echo "Cleaning old backups..."
find "$BACKUP_DIR" -name "event_access_backup_*.tar.gz" -mtime +7 -delete

# Optional: Upload to cloud storage (uncomment and configure)
# aws s3 cp "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" s3://your-backup-bucket/
# rclone copy "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" remote:backups/

echo "Backup completed: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"

# Send notification (optional)
# curl -X POST -H 'Content-type: application/json' \
#   --data '{"text":"Database backup completed"}' \
#   YOUR_SLACK_WEBHOOK_URL