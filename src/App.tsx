/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AppLayout from './components/AppLayout';
import Home from './views/Home';
import SearchOverlay from './views/SearchOverlay';
import Product from './views/Product';
import Runner from './views/Runner';
import Community from './views/Community';
import Studio from './views/Studio';
import CreateApp from './views/CreateApp';
import Profile from './views/Profile';
import Auth from './views/Auth';
import EditApp from './views/EditApp';
import Notifications from './views/Notifications';

function AuthenticatedRoutes({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  );

  if (!user) return <Auth />;

  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          
          <Route path="/" element={<AuthenticatedRoutes><Home /></AuthenticatedRoutes>} />
          <Route path="/search" element={<AuthenticatedRoutes><SearchOverlay /></AuthenticatedRoutes>} />
          <Route path="/app/:id" element={<AuthenticatedRoutes><Product /></AuthenticatedRoutes>} />
          <Route path="/run/:id" element={<AuthenticatedRoutes><Runner /></AuthenticatedRoutes>} />
          <Route path="/community" element={<AuthenticatedRoutes><Community /></AuthenticatedRoutes>} />
          <Route path="/studio" element={<AuthenticatedRoutes><Studio /></AuthenticatedRoutes>} />
          <Route path="/create" element={<AuthenticatedRoutes><CreateApp /></AuthenticatedRoutes>} />
          <Route path="/edit/:id" element={<AuthenticatedRoutes><EditApp /></AuthenticatedRoutes>} />
          <Route path="/profile" element={<AuthenticatedRoutes><Profile /></AuthenticatedRoutes>} />
          <Route path="/profile/:uid" element={<AuthenticatedRoutes><Profile /></AuthenticatedRoutes>} />
          <Route path="/notifications" element={<AuthenticatedRoutes><Notifications /></AuthenticatedRoutes>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

