// Audit Log Viewer UI scaffold (React client component)
// Place in components/ and link from admin/audit-logs page

import React, { useEffect, useState } from 'react';

interface AuditLog {
  timestamp: string;
  user?: { email?: string };
  userId?: string;
  action: string;
  resource: string;
  details: string;
}

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/audit-logs')
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs || []);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading audit logs...</div>;

  return (
    <div>
      <h2>Audit Logs</h2>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, idx) => (
            <tr key={idx}>
              <td>{log.timestamp}</td>
              <td>{log.user?.email || log.userId}</td>
              <td>{log.action}</td>
              <td>{log.resource}</td>
              <td>{log.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
