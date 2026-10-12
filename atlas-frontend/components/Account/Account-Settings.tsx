'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GeneralSidebar from '@/components/Sidebar';
import { Eye, EyeOff, FileText, UploadCloud, X, Check } from 'lucide-react';
import { fetchUserData } from '@/utils/api/users'; 
import { changePassword } from "../../utils/api/change-password";

export default function AccountSettings() {
  const router = useRouter();

  const [userID, setUserID] = useState('');
  const [userRole, setUserRole] = useState('');
  const [email, setEmail] = useState('');
  const [orcidId, setOrcidId] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const [accountPublic, setAccountPublic] = useState(false);
  const [totalNotes, setTotalNotes] = useState(0);
  const [totalUploads, setTotalUploads] = useState(0);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showAlert, setShowAlert] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const calculatePasswordStrength = (password: string) => {
    if (password.length === 0) return { strength: 0, label: '', color: '' };
    if (password.length < 8) return { strength: 1, label: 'Weak', color: 'bg-red-500' };
    
    let strength = 1;
    if (password.length >= 8) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength: 1, label: 'Weak', color: 'bg-red-500' };
    if (strength === 3) return { strength: 2, label: 'Fair', color: 'bg-orange-500' };
    if (strength === 4) return { strength: 3, label: 'Good', color: 'bg-yellow-500' };
    return { strength: 4, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = calculatePasswordStrength(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  const fetchUser = async () => {
    try {
      const data = await fetchUserData();
      setUserID(data.message || data.username || '');
      setUserRole(data.role || '');
      setEmail(data.email || 'user@example.com');
      setOrcidId(data.orcid_id || '');
      setAuthenticated(true);
      setAccountPublic(Boolean(data.status));
      setTotalNotes(data.notes?.length || 0);
      setTotalUploads(data.uploads?.length || 0);
    } catch (err) {
      console.error('Error fetching user:', err);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [router]);

  if (loading) return <p className="p-6 text-gray-500">Loading...</p>;
  if (!authenticated) return null;

  const handlePasswordChange = () => setShowModal(true);

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setShowAlert("Please fill out all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setShowAlert("New passwords do not match.");
      return;
    }

    setSubmitting(true);
    setShowAlert("");

    try {
      await changePassword({ currentPassword, newPassword });
      setShowAlert("✅ Password changed successfully!");
      setShowModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setShowAlert(`❌ ${err.message}`);
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };


return (
  <div className="flex h-screen w-screen 
                  bg-[var(--panel-bg)] text-[var(--panel-text)]
                  transition-colors duration-300"> 

    {/* Sidebar */}
    <div className="fixed left-0 top-0 h-full">
      <GeneralSidebar user={userID} role={userRole} onLogoutSuccess={fetchUser} />
    </div>

    {/* Main Content */}
    <main className="flex-1 flex flex-col justify-center items-center p-10">
      <div className="flex w-full max-w-6xl 
                      bg-[var(--panel-bg)] text-[var(--panel-text)]
                      rounded-2xl shadow-lg p-10 border 
                      border-[var(--panel-text)]/20">

        {/* LEFT SIDE */}
        <div className="w-1/2 border-r 
                        border-[var(--panel-text)]/20 pr-8">
          <div className="flex flex-col items-center text-center">
            <img
              src="https://cdn-icons-png.flaticon.com/512/847/847969.png"
              alt="Profile"
              className="w-28 h-28 rounded-full border-4 
                         border-[var(--panel-text)]/20 object-cover mb-4"
            />
            <h2 className="text-2xl font-semibold mb-1">{userID}</h2>
            <p className="opacity-70 mb-6">{email}</p>
          </div>

          <div className="space-y-4 text-left">
            <div>
              <label className="block text-sm opacity-70 mb-1">Username</label>
              <input 
                type="text" 
                value={userID} 
                readOnly 
                className="w-full p-2 border rounded-lg 
                           bg-[var(--panel-bg)] border-[var(--panel-text)]/20 
                           cursor-not-allowed" 
              />
            </div>

            <div>
              <label className="block text-sm opacity-70 mb-1">Email</label>
              <input 
                type="text" 
                value={email} 
                readOnly 
                className="w-full p-2 border rounded-lg 
                           bg-[var(--panel-bg)] border-[var(--panel-text)]/20 
                           cursor-not-allowed" 
              />
            </div>

            <div>
              <label className="block text-sm opacity-70 mb-1">ORCID</label>
              {orcidId ? (
                <a 
                  href={`https://orcid.org/${orcidId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full p-2 border rounded-lg 
                             bg-[var(--panel-bg)] border-[var(--panel-text)]/20 
                             block text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {orcidId}
                </a>
              ) : (
                <input 
                  type="text" 
                  value="Not connected" 
                  readOnly 
                  className="w-full p-2 border rounded-lg 
                             bg-[var(--panel-bg)] border-[var(--panel-text)]/20 
                             cursor-not-allowed"
                />
              )}
            </div>

            <div>
              <label className="block text-sm opacity-70 mb-1">Password</label>
              <div className="flex items-center">
                <input 
                  type="password" 
                  value="********" 
                  readOnly 
                  className="w-full p-2 border rounded-lg 
                             bg-[var(--panel-bg)] border-[var(--panel-text)]/20 
                             cursor-not-allowed" 
                />
                <button
                  onClick={handlePasswordChange}
                  className="ml-3 px-4 py-2 text-sm font-medium 
                             bg-blue-600 text-white rounded-lg 
                             hover:bg-blue-700 transition"
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="w-1/2 pl-8 flex flex-col justify-center gap-6">
          {/* Visibility Card */}
          <div className="flex items-center justify-between 
                          bg-[var(--panel-bg)] border border-[var(--panel-text)]/20
                          rounded-xl p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-3">
              {accountPublic 
                ? <Eye className="text-green-500 w-6 h-6" /> 
                : <EyeOff className="text-gray-500 w-6 h-6" />
              }
              <span className="text-lg font-semibold">Account Visibility</span>
            </div>
            <span className={`text-sm font-medium ${accountPublic ? 'text-green-600' : 'opacity-70'}`}>
              {accountPublic ? 'Public' : 'Private'}
            </span>
          </div>

          {/* Notes */}
          <div className="flex items-center justify-between 
                          bg-[var(--panel-bg)] border border-[var(--panel-text)]/20
                          rounded-xl p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <FileText className="text-blue-500 w-6 h-6" />
              <span className="text-lg font-semibold">Notes</span>
            </div>
            <span className="text-sm font-medium text-blue-600">{totalNotes} total</span>
          </div>

          {/* Uploads */}
          <div className="flex items-center justify-between 
                          bg-[var(--panel-bg)] border border-[var(--panel-text)]/20
                          rounded-xl p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <UploadCloud className="text-purple-500 w-6 h-6" />
              <span className="text-lg font-semibold">Uploads</span>
            </div>
            <span className="text-sm font-medium text-purple-600">{totalUploads} total</span>
          </div>
        </div>
      </div>
    </main>

    {/* PASSWORD MODAL */}
    {showModal && (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
        <div className="bg-[var(--panel-bg)] text-[var(--panel-text)]
                        rounded-2xl shadow-xl p-8 w-full max-w-md relative border 
                        border-[var(--panel-text)]/20">

          <button
            className="absolute top-3 right-3 opacity-70 hover:opacity-100"
            onClick={() => setShowModal(false)}
          >
            <X size={20} />
          </button>

          <h3 className="text-xl font-semibold mb-4 text-center">Change Password</h3>

          {showAlert && (
            <div className="mb-3 text-center text-sm text-red-500">
              {showAlert}
            </div>
          )}

          <div className="space-y-3">
            <input
              type="password"
              placeholder="Current Password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full p-2 border rounded-lg 
                         bg-[var(--panel-bg)] border-[var(--panel-text)]/20"
            />

            <div>
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-2 border rounded-lg 
                           bg-[var(--panel-bg)] border-[var(--panel-text)]/20"
              />
              
              {newPassword && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs opacity-70">Password Strength</span>
                    <span className={`text-xs font-semibold ${
                      passwordStrength.strength === 1 ? 'text-red-500' :
                      passwordStrength.strength === 2 ? 'text-orange-500' :
                      passwordStrength.strength === 3 ? 'text-yellow-500' :
                      'text-green-500'
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: `${(passwordStrength.strength / 4) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-2 pr-10 border rounded-lg 
                           bg-[var(--panel-bg)] border-[var(--panel-text)]/20"
              />
              {confirmPassword && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <X className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 
                         text-white font-semibold rounded-lg mt-4 transition 
                         disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);

}
