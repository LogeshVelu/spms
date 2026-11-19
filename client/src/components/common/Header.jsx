import React, { useState, useEffect } from 'react';
import BrandLogo from './BrandLogo';
import { api } from '../../services/api';

export const Header = ({ user, profile, onLogout, notifications = [], onNotificationRead, onMarkAllNotificationsRead }) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const getRoleBadge = (role) => {
    switch (role) {
      case 'ADMIN':
        return { label: 'Admin Portal', color: 'bg-purple-600 text-white' };
      case 'RECRUITER':
        return { label: 'Recruiter Portal', color: 'bg-emerald-600 text-white' };
      case 'STUDENT':
        return { label: 'Student Portal', color: 'bg-blue-600 text-white' };
      default:
        return { label: 'Guest', color: 'bg-slate-600 text-white' };
    }
  };

  const badge = getRoleBadge(user?.role);
  const displayName = profile?.full_name || profile?.company_name || user?.email?.split('@')[0] || 'User';

  return (
    <header className="bg-[#001F44] text-white border-b border-[#032D5B] sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-4">
          <BrandLogo className="h-10 w-10" variant="light" />
          <span className={`text-xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg bg-[#032D5B] text-slate-200 hover:text-white hover:bg-[#0A1B30] transition relative"
              title="Campus Drive Alerts & Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black h-4 w-4 rounded-full flex items-center justify-center animate-pulse shadow-sm">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 py-2 z-50">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-[#001F44]">Campus Drive Alerts</span>
                    {unreadCount > 0 && (
                      <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                        {unreadCount} Pending
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAllNotificationsRead && onMarkAllNotificationsRead();
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-400">
                      No drive alerts yet. New job openings will notify you here.
                    </div>
                  ) : (
                    notifications.map(n => {
                      const isUnread = !n.is_read;
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (isUnread) onNotificationRead(n.id);
                          }}
                          className={`p-3 text-xs cursor-pointer transition ${
                            isUnread
                              ? 'bg-blue-50/70 border-l-4 border-l-blue-600 hover:bg-blue-100/60'
                              : 'bg-white hover:bg-slate-50 opacity-80'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              {isUnread && (
                                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse shrink-0"></span>
                              )}
                              <span className={`text-[#001F44] ${isUnread ? 'font-extrabold' : 'font-semibold'}`}>
                                {n.title}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono ml-2 shrink-0">
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className={`text-slate-600 leading-relaxed ${isUnread ? 'font-medium' : 'font-normal'}`}>
                            {n.message}
                          </p>
                          {isUnread && (
                            <div className="mt-1.5 flex items-center justify-end">
                              <span className="text-[10px] text-blue-700 font-bold hover:underline">
                                Click to mark read ✓
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Info Capsule */}
          <div className="flex items-center gap-3 bg-[#032D5B] px-3 py-1.5 rounded-lg border border-slate-700/50">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D4AF37] text-[#001F44] font-black text-xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold leading-tight truncate max-w-[150px]">{displayName}</div>
              <div className="text-[10px] text-slate-300 leading-tight truncate max-w-[150px]">{user?.email}</div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="px-3 py-1.5 text-xs font-semibold bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg transition shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
