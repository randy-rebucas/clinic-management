#!/bin/bash
# MongoDB Backup Script for MyClinicSoft
# Usage: ./scripts/backup/backup.sh [backup_dir]

BACKUP_DIR=${1:-"./backups/$(date +%Y%m%d_%H%M%S)"}
MONGO_URI=${MONGODB_URI:-"mongodb://localhost:27017/myclinicsoft"}

mkdir -p "$BACKUP_DIR"
echo "Backing up MongoDB to $BACKUP_DIR..."
mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR"
if [ $? -eq 0 ]; then
  echo "Backup completed successfully."
else
  echo "Backup failed!"
  exit 1
fi
