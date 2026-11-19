import React, { useState, useEffect } from 'react';
import Header from './components/common/Header';
import BrandLogo from './components/common/BrandLogo';
import StudentPortal from './components/student/StudentPortal';
import RecruiterPortal from './components/recruiter/RecruiterPortal';
import AdminPortal from './components/admin/AdminPortal';
import AuthModal from './components/auth/AuthModal';
import { api } from './services/api';

export function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTargetRole, setAuthModalTargetRole] = useState(null);

  const handleOpenAuth = (role = null) => {
    setAuthModalTargetRole(role);
    setShowAuthModal(true);
  };

  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    setLoading(true);
    const token = api.getToken();
    if (!token) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.getMe();
      setUser(res.data.user);
      setProfile(res.data.profile);
      loadNotifications();
    } catch (err) {
      api.logout();
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  // Periodic notification polling so student sees recruiter announcements in real-time
  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const loadNotifications = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.data || []);
    } catch (err) {
      // ignore
    }
  };

  const handleNotificationRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err) {
      // ignore
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      // ignore
    }
  };

  const handleSwitchDemoAccount = async (email) => {
    setLoading(true);
    try {
      const res = await api.switchDemo(email);
      setUser(res.data.user);
      setProfile(res.data.profile);
      loadNotifications();
    } catch (err) {
      console.error('Demo account switch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setProfile(null);
    setNotifications([]);
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-[#00142D] text-white flex flex-col items-center justify-center p-4">
        <BrandLogo className="h-20 w-20 mb-4 animate-bounce" variant="light" showText={false} />
        <h2 className="text-xl font-bold tracking-tight">Student Placement Management System</h2>
        <p className="text-xs text-slate-400 mt-1">Connecting to authoritative placement engine...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-[#001F44] selection:text-[#D4AF37]">
      {/* Main Header at Top */}
      {user ? (
        <Header
          user={user}
          profile={profile}
          onLogout={handleLogout}
          notifications={notifications}
          onNotificationRead={handleNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        />
      ) : (
        <header className="bg-[#001F44] text-white py-4 px-6 border-b border-[#032D5B] flex items-center justify-between">
          <BrandLogo className="h-10 w-10" variant="light" />
          <button
            onClick={() => handleOpenAuth(null)}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-[#D4AF37] text-[#001F44] hover:bg-[#C9A34A] transition shadow"
          >
            Sign In / Register
          </button>
        </header>
      )}

      {/* Main Content Area based on User Role */}
      <main className="flex-1 pb-16">
        {!user ? (
          /* Unauthenticated Landing */
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <div className="flex justify-center mb-6">
              <BrandLogo className="h-24 w-24" variant="dark" showText={false} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#001F44] tracking-tight">
              Student Placement Management System (SPMS)
            </h1>
            <p className="text-slate-600 text-sm max-w-2xl mx-auto mt-3 leading-relaxed">
              Enterprise Campus Recruitment Automation Platform. Clean Architecture REST API with unified Role-Based Access Control (RBAC), Authoritative Eligibility Engine, and Immutable Resume Snapshots.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => handleOpenAuth('STUDENT')}
                className="px-6 py-3 rounded-xl font-extrabold text-xs bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-lg transition"
              >
                Launch as Student
              </button>
              <button
                onClick={() => handleOpenAuth('RECRUITER')}
                className="px-6 py-3 rounded-xl font-extrabold text-xs bg-emerald-700 text-white hover:bg-emerald-800 shadow-lg transition"
              >
                Launch as Recruiter
              </button>
              <button
                onClick={() => handleOpenAuth('ADMIN')}
                className="px-6 py-3 rounded-xl font-extrabold text-xs bg-purple-700 text-white hover:bg-purple-800 shadow-lg transition"
              >
                Launch as Placement Admin
              </button>
            </div>
          </div>
        ) : user.role === 'STUDENT' ? (
          <StudentPortal
            user={user}
            profile={profile}
            onRefresh={checkCurrentUser}
          />
        ) : user.role === 'RECRUITER' ? (
          <RecruiterPortal
            user={user}
            profile={profile}
            onRefresh={checkCurrentUser}
          />
        ) : user.role === 'ADMIN' ? (
          <AdminPortal
            user={user}
            profile={profile}
            onRefresh={checkCurrentUser}
          />
        ) : null}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#001F44]">SPMS v4.0</span>
            <span>•</span>
            <span>Indian Institute of Technology Madras</span>
          </div>
          <div>
            Built with React 19 + Node.js (Express) + PostgreSQL
          </div>
        </div>
      </footer>

      {/* Manual Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        targetRole={authModalTargetRole}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={(authData) => {
          setUser(authData.user);
          setProfile(authData.profile);
          loadNotifications();
        }}
      />
    </div>
  );
}

export default App;
