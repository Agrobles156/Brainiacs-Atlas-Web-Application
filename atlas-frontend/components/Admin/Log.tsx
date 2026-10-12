'use client';

import { useState, useEffect } from "react";
import React from "react";

type LogInfo = {
  _id: string;
  user_id?: string;
  username?: string;
  login_at?: string;
  ip_address?: string;
  [key: string]: any;
};

export default function Log() {
  const [logs, setLogs] = useState<LogInfo[]>([]);
  const [reload, setReload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const getLogs = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await fetch('/flask-api/admin/logs', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });

        const data = await res.json().catch(() => []);

        if (!res.ok) {
          setErrorMsg(`HTTP ${res.status} ${res.statusText}`);
          setLogs([]);
        } else if (Array.isArray(data)) {
          const sorted = [...data].sort((a, b) => {
            const dateA = new Date(a.login_at || 0).getTime();
            const dateB = new Date(b.login_at || 0).getTime();
            return dateB - dateA;
          });
          setLogs(sorted);
        } else {
          setLogs([]);
        }
      } catch (e: any) {
        setErrorMsg(e?.message || "No response from server");
      } finally {
        setLoading(false);
        setReload(false);
      }
    };

    getLogs();
  }, [reload]);

  const refresh = () => setReload(true);

  const formatDate = (isoString: string | undefined) => {
    if (!isoString) return "—";
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="
        w-full px-4 sm:px-6 lg:px-10 py-4
        bg-[var(--panel-bg)]
        text-[var(--panel-text)]
        transition-colors duration-200
      "
    >
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">{`Login Logs`}</h1>
          <p className="text-sm mt-1 text-[var(--panel-subtext)]">
            A detailed history of user login activity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="
              rounded-full px-4 py-1.5 text-sm font-semibold
              bg-[var(--badge-bg)]
              text-[var(--badge-text)]
              shadow-sm
            "
          >
            {logs.length} total
          </span>

          <button
            onClick={refresh}
            className="
              rounded-lg px-4 py-2 text-sm font-medium
              bg-[var(--btn-bg)]
              text-[var(--btn-text)]
              hover:bg-[var(--btn-hover)]
              transition shadow-md
            "
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ERROR */}
      {errorMsg && (
        <div
          className="
            mb-4 rounded-lg border px-5 py-3 shadow-sm
            border-[var(--error-border)]
            bg-[var(--error-bg)]
            text-[var(--error-text)]
          "
        >
          <b>Error:</b> {errorMsg}
        </div>
      )}

      {/* TABLE CARD */}
      {!loading && !errorMsg && (
        <div
          className="
            rounded-2xl border shadow-xl overflow-hidden
            border-[var(--card-border)]
            bg-[var(--card-bg)]
          "
        >
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
            <table className="min-w-full text-[15px]">
              <thead
                className="
                  sticky top-0 text-[13px] uppercase tracking-wider shadow
                  bg-[var(--table-head-bg)]
                  text-[var(--table-head-text)]
                "
              >
                <tr>
                  <th className="px-6 py-4 font-semibold text-left">Username</th>
                  <th className="px-6 py-4 font-semibold text-left">Login Date</th>
                  <th className="px-6 py-4 font-semibold text-left">IP Address</th>
                </tr>
              </thead>

              <tbody>
                {logs.map((log, idx) => (
                  <tr
                    key={log._id || idx}
                    className="hover:bg-[var(--table-row-hover)] transition"
                  >
                    <td className="px-6 py-4 font-medium">
                      {log.username || log.user_id || "—"}
                    </td>
                    <td className="px-6 py-4 text-[var(--panel-subtext)]">
                      {formatDate(log.login_at)}
                    </td>
                    <td className="px-6 py-4 text-[var(--panel-subtext)]">
                      {log.ip_address || "—"}
                    </td>
                  </tr>
                ))}

                {logs.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-5 py-10 text-center text-[var(--panel-subtext)]"
                    >
                      No logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div
          className="
            rounded-xl border p-6 text-center shadow-lg
            border-[var(--card-border)]
            bg-[var(--card-bg)]
          "
        >
          <div className="animate-spin h-6 w-6 border-4 border-[var(--panel-subtext)] border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-[var(--panel-subtext)]">Loading logs…</p>
        </div>
      )}
    </div>
  );
}
