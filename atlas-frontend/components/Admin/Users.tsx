'use client';

import { useState, useEffect, useMemo } from "react";
import React from "react";
import { FiUser, FiTrash2, FiRefreshCw } from "react-icons/fi";

type userInfo = {
  name: string;
  email: string;
  role: string;
  status: boolean;
};

export default function UsersAdminView() {
  const [userArr, setUserArr] = useState<userInfo[]>([]);
  const [userFieldChange, setUserChange] = useState<boolean>(false);

  // NEW: Filter + sort states
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [showAlertError, setShowAlertError] = useState(false);
  const [showAlertSuc, setShowAlertSuc] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const pullAllUsers = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/flask-api/admin/users', {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          setErrorMsg(data?.error || `HTTP ${res.status}`);
          setUserArr([]);
        } else {
          const list: userInfo[] = Array.isArray(data) ? data : (data.message ?? []);
          setUserArr(list || []);
        }
      } catch (e: any) {
        setErrorMsg(e?.message || 'No response from server');
      } finally {
        setLoading(false);
        setUserChange(false);
      }
    };
    pullAllUsers();
  }, [userFieldChange]);

  async function handleFieldUpdate(userEmail: string, field: 'role' | 'status', value: string | boolean) {
    setAlertMessage(null);
    setShowAlertError(false);
    setShowAlertSuc(false);
    try {
      const res = await fetch('/flask-api/admin/user/field', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, field, value }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && !data?.error) {
        setUserChange(true);
        setShowAlertSuc(true);
        setAlertMessage(`User "${userEmail}" updated successfully`);
      } else {
        setAlertMessage(data?.error || `Failed to update ${field}`);
        setShowAlertError(true);
      }
    } catch {
      setAlertMessage('Network error while updating user');
      setShowAlertError(true);
    }
  }

  async function handleDelete(userEmail: string) {
    if (!confirm(`Delete user "${userEmail}"?`)) return;

    setAlertMessage(null);
    setShowAlertError(false);
    setShowAlertSuc(false);

    try {
      const res = await fetch('/flask-api/admin/user', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && !data?.error) {
        setUserChange(true);
        setShowAlertSuc(true);
        setAlertMessage(`Deleted user: ${userEmail}`);

        // ⏳ Auto-hide after 5 seconds
        setTimeout(() => {
          setAlertMessage(null);
          setShowAlertSuc(false);
        }, 5000);

      } else {
        setAlertMessage(data?.error || 'Failed to delete user');
        setShowAlertError(true);

        // ⏳ Auto-hide error after 5 seconds
        setTimeout(() => {
          setAlertMessage(null);
          setShowAlertError(false);
        }, 5000);
      }

    } catch {
      setAlertMessage('Network error while deleting user');
      setShowAlertError(true);

      // ⏳ Auto-hide network error after 5 seconds
      setTimeout(() => {
        setAlertMessage(null);
        setShowAlertError(false);
      }, 5000);
    }
  }

  const refresh = () => setUserChange(true);

  const RoleBadge = ({ role }: { role: string }) => (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold
      bg-[var(--badge-bg)] text-[var(--panel-text)] ring-1 ring-[var(--border)]">
      {role}
    </span>
  );

  const StatusBadge = ({ ok }: { ok: boolean }) => (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold
      ${ok ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}
      ring-1 ring-[var(--border)]`}>
      {ok ? 'Allowed' : 'Blocked'}
    </span>
  );

  // 🔥 NEW: FILTER + SORT LOGIC (memoized for performance)
  const filteredUsers = useMemo(() => {
    let arr = [...userArr];

    if (filterRole !== "all") {
      arr = arr.filter((u) => u.role === filterRole);
    }

    if (filterStatus !== "all") {
      arr = arr.filter((u) => (filterStatus === "allowed" ? u.status : !u.status));
    }

    arr.sort((a, b) => {
      return sortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });

    return arr;
  }, [userArr, filterRole, filterStatus, sortOrder]);

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-6 transition-colors duration-200
                    bg-[var(--panel-bg)] text-[var(--panel-text)]">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <FiUser className="text-indigo-500" /> User Management
        </h1>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[var(--badge-bg)] px-4 py-1 text-sm font-medium text-[var(--panel-text)] ring-1 ring-[var(--border)]">
            {filteredUsers.length} users
          </span>

          <button
            onClick={refresh}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white font-semibold hover:bg-indigo-700 transition">
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      {/* 🔥 FILTER BAR */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-[var(--card-bg)] ring-1 ring-[var(--border)]">

        {/* Filter by Role */}
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--panel-bg)] ring-1 ring-[var(--border)]">
          <option value="all">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>

        {/* Filter by Status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--panel-bg)] ring-1 ring-[var(--border)]">
          <option value="all">All Status</option>
          <option value="allowed">Allowed</option>
          <option value="blocked">Blocked</option>
        </select>

        {/* Sort */}
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
          className="px-3 py-2 rounded-lg bg-[var(--panel-bg)] ring-1 ring-[var(--border)]">
          <option value="asc">Name A → Z</option>
          <option value="desc">Name Z → A</option>
        </select>
      </div>

      {/* ALERTS */}
      {alertMessage && (
        <div className={`rounded-lg p-4 text-sm font-medium ring-1
          ${showAlertSuc ? 'bg-emerald-500/20 text-emerald-600 ring-emerald-500/40' : ''}
          ${showAlertError ? 'bg-rose-500/20 text-rose-600 ring-rose-500/40' : ''}`}>
          {alertMessage}
        </div>
      )}

      {/* TABLE */}
      {!loading && !errorMsg && (
        <div className="overflow-x-auto rounded-xl shadow-md ring-1 ring-[var(--border)] bg-[var(--card-bg)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead className="bg-[var(--table-header)]">
              <tr>
                {["Name", "Email", "Role", "Status", "Actions", "Delete"].map((col) => (
                  <th key={col} className="px-6 py-3 text-left font-semibold uppercase">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border)]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center opacity-70">
                    No matching users.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, idx) => (
                  <tr key={idx} className="hover:bg-[var(--hover-bg)] transition">
                    <td className="px-6 py-4 font-medium">{user.name}</td>
                    <td className="px-6 py-4">{user.email}</td>
                    <td className="px-6 py-4"><RoleBadge role={user.role} /></td>
                    <td className="px-6 py-4"><StatusBadge ok={user.status} /></td>

                    <td className="px-6 py-4 flex gap-4">
                      <button
                        onClick={() =>
                          handleFieldUpdate(
                            user.email,
                            "role",
                            user.role === "admin" ? "user" : "admin"
                          )
                        }
                        className="text-indigo-400 hover:text-indigo-300 underline">
                        {user.role === "admin" ? "Make User" : "Make Admin"}
                      </button>

                      <button
                        onClick={() => handleFieldUpdate(user.email, "status", !user.status)}
                        className="text-emerald-400 hover:text-emerald-300 underline">
                        {user.status ? "Block" : "Allow"}
                      </button>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleDelete(user.email)}
                        className="text-rose-400 hover:text-rose-300 underline flex items-center gap-1 justify-center">
                        <FiTrash2 /> Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="rounded-lg p-6 bg-[var(--card-bg)] shadow ring-1 ring-[var(--border)] text-center">
          Loading users…
        </div>
      )}

      {/* ERROR */}
      {errorMsg && (
        <div className="rounded-lg p-6 bg-rose-500/20 text-rose-600 shadow ring-1 ring-rose-500/40 text-center">
          <b>Failed to load users:</b> {errorMsg}
        </div>
      )}
    </div>
  );
}
