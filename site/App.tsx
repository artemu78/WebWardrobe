import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import InstallationGuide from './pages/InstallationGuide';
import Account from './pages/Account';
import { Layout } from './components/Layout';

import { GoogleOAuthProvider } from '@react-oauth/google';
import LoginCallback from './pages/LoginCallback';

const GOOGLE_CLIENT_ID = "20534293634-a3r95j8cifmbgon1se9g7me9fbebu5aq.apps.googleusercontent.com";

const App: React.FC = () => {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/install" element={<InstallationGuide />} />
            <Route path="/account" element={<Account />} />
            <Route path="/login_callback" element={<LoginCallback />} />
            <Route path="/login_callback/*" element={<LoginCallback />} />
          </Routes>
        </Layout>
      </Router>
    </GoogleOAuthProvider>
  );
};

export default App;
