#!/bin/bash
# MongoDB Restore Script for MyClinicSoft
# Usage: ./scripts/backup/restore.sh [backup_dir]

BACKUP_DIR=${1:-"./backups/latest"}
MONGO_URI=${MONGODB_URI:-"mongodb://localhost:27017/myclinicsoft"}

echo "Restoring MongoDB from $BACKUP_DIR..."
mongorestore --uri="$MONGO_URI" "$BACKUP_DIR"
if [ $? -eq 0 ]; then
  echo "Restore completed successfully."
else
  echo "Restore failed!"
  exit 1
fi
