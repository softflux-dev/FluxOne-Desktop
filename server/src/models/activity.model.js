/**
 * Single writer for activity_logs — used by auth, sale, return, exchange,
 * cash drawer, sync, and admin. Prefer this over per-domain insert helpers.
 */
import { connectDb } from '../config/database.js';

export function insertActivity({
  id,
  employeeId,
  action,
  entityType = null,
  entityId = null,
  details = null,
}) {
  const db = connectDb();
  db.prepare(
    `
    INSERT INTO activity_logs (id, employee_id, action, entity_type, entity_id, details)
    VALUES (@id, @employeeId, @action, @entityType, @entityId, @details)
  `
  ).run({ id, employeeId, action, entityType, entityId, details });
}
