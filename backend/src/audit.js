export async function audit(client, req, action, entityType = null, entityId = null, details = {}) {
  const actor = req.auth?.user;
  await client.query(`
    INSERT INTO epen.audit_log (user_id, username, action, entity_type, entity_id, details, ip)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
  `, [actor?.id || null, actor?.username || null, action, entityType, entityId ? String(entityId) : null, JSON.stringify(details), req.ip || null]);
}

