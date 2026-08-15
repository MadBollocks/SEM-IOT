import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import QRScanner from './components/QRScanner';
import ManufacturerSerialization from './components/ManufacturerSerialization';

const ROLE_LABELS = {
  manufacturer: 'Manufacturer',
  pharmacy: 'Pharmacy',
  consumer: 'Consumer'
};

const initialAuthForm = {
  email: '',
  password: '',
  confirmPassword: '',
  role: 'manufacturer'
};

function getUserRole(user) {
  return user?.user_metadata?.role || 'consumer';
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session ?? null);
        setLoadingSession(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession ?? null);
      setLoadingSession(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const currentRole = useMemo(() => getUserRole(session?.user), [session]);

  const updateFormField = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setAuthError('');
    setAuthMessage('');
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthMessage('');

    if (authForm.password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }

    if (authForm.password !== authForm.confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: authForm.email.trim(),
      password: authForm.password,
      options: {
        data: {
          role: authForm.role
        }
      }
    });
    setIsSubmitting(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthForm(initialAuthForm);

    if (!data.session) {
      setAuthMessage('Account created. Check your email to confirm your account, then sign in.');
      setAuthMode('login');
      return;
    }

    setAuthMessage('Account created and signed in.');
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthMessage('');
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password
    });

    setIsSubmitting(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage('Welcome back.');
    setAuthForm(initialAuthForm);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthForm(initialAuthForm);
    setAuthMessage('');
    setAuthError('');
  };

  if (loadingSession) {
    return <div className="app-shell loading-screen">Loading...</div>;
  }

  if (!session) {
    const isLogin = authMode === 'login';

    return (
      <div className="auth-page">
        <div className="auth-panel auth-brand">
          <p className="eyebrow">SEM-IOT</p>
          <h1>MedVerify Portal</h1>
          <p>
            Secure pharmaceutical serialization, pharmacy cold-chain handoff, and consumer authenticity
            verification in one platform.
          </p>
        </div>

        <div className="auth-panel auth-form-panel">
          <h2>{isLogin ? 'Sign in' : 'Create account'}</h2>
          <p className="auth-subtitle">
            {isLogin
              ? 'Use your account to access your role dashboard.'
              : 'Create your account and choose the dashboard role you need.'}
          </p>

          <form onSubmit={isLogin ? handleLogin : handleRegister} className="auth-form">
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => updateFormField('email', e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => updateFormField('password', e.target.value)}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
              />
            </label>

            {!isLogin && (
              <>
                <label>
                  Confirm password
                  <input
                    type="password"
                    value={authForm.confirmPassword}
                    onChange={(e) => updateFormField('confirmPassword', e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>

                <label>
                  Role
                  <select value={authForm.role} onChange={(e) => updateFormField('role', e.target.value)}>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="pharmacy">Pharmacy</option>
                    <option value="consumer">Consumer</option>
                  </select>
                </label>
              </>
            )}

            {authError && <p className="auth-feedback error">{authError}</p>}
            {authMessage && <p className="auth-feedback success">{authMessage}</p>}

            <button type="submit" className="primary-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait...' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            type="button"
            className="link-btn"
            onClick={() => switchAuthMode(isLogin ? 'register' : 'login')}
          >
            {isLogin ? "Don't have an account? Register" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MedVerify Platform</p>
          <h1>{ROLE_LABELS[currentRole] || 'User'} Dashboard</h1>
          <p className="header-meta">Signed in as {session.user.email}</p>
        </div>
        <button type="button" className="secondary-btn" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <main className="dashboard-main">
        {currentRole === 'manufacturer' && (
          <RoleHomeCard
            title="Manufacturer Control Center"
            description="Create shipments, serialize medicine packs, and export operational label bundles."
          >
            <ManufacturerSerialization />
          </RoleHomeCard>
        )}

        {currentRole === 'pharmacy' && (
          <RoleHomeCard
            title="Pharmacy Intake Console"
            description="Capture cold-chain handoff telemetry and mark shipments as received."
          >
            <PharmacyDashboard />
          </RoleHomeCard>
        )}

        {currentRole === 'consumer' && (
          <RoleHomeCard
            title="Consumer Verification Center"
            description="Scan labels and verify authenticity and thermal integrity before use."
          >
            <ConsumerDashboard />
          </RoleHomeCard>
        )}
      </main>
    </div>
  );
}

function RoleHomeCard({ title, description, children }) {
  return (
    <section className="role-card">
      <h2>{title}</h2>
      <p className="role-description">{description}</p>
      <div className="role-content">{children}</div>
    </section>
  );
}

function PharmacyDashboard() {
  const [sscc, setSscc] = useState('');
  const [minTemp, setMinTemp] = useState(3.0);
  const [maxTemp, setMaxTemp] = useState(7.5);
  const [status, setStatus] = useState('');

  const handleSimulateSync = async () => {
    if (!sscc) {
      setStatus('❌ Enter an SSCC code.');
      return;
    }

    setStatus('Syncing environmental payload...');

    const isCompromised = minTemp < 2.0 || maxTemp > 8.0;

    const { error: logErr } = await supabase.from('thermal_logs').insert([
      {
        parent_sscc: sscc,
        min_temp: minTemp,
        max_temp: maxTemp,
        out_of_bounds_duration: isCompromised ? 120 : 0
      }
    ]);

    if (logErr) {
      setStatus(`❌ Logging failed: ${logErr.message}`);
      return;
    }

    const { error: parentErr } = await supabase
      .from('parent_shipments')
      .update({ status: 'RECEIVED_AT_PHARMACY', is_compromised: isCompromised })
      .eq('sscc', sscc);

    if (parentErr) {
      setStatus(`❌ Parent update failed: ${parentErr.message}`);
      return;
    }

    await supabase.from('child_items').update({ status: 'RECEIVED_AT_PHARMACY' }).eq('parent_sscc', sscc);

    if (isCompromised) {
      setStatus(`🔴 Handoff complete with BREACH ALERT. Max temp reached ${maxTemp}°C.`);
      return;
    }

    setStatus('🟢 Handoff complete! Cold-chain verified safe.');
  };

  return (
    <div className="workflow-panel">
      <label>
        Parent SSCC Code
        <input
          type="text"
          placeholder="SSCC-XXXXXX"
          value={sscc}
          onChange={(e) => setSscc(e.target.value)}
        />
      </label>

      <div className="sensor-box">
        <h3>Simulated Sensor Readings</h3>
        <label>
          Min Temp (°C)
          <input type="number" step="0.1" value={minTemp} onChange={(e) => setMinTemp(Number(e.target.value))} />
        </label>
        <label>
          Max Temp (°C)
          <input type="number" step="0.1" value={maxTemp} onChange={(e) => setMaxTemp(Number(e.target.value))} />
        </label>
      </div>

      <button type="button" className="primary-btn" onClick={handleSimulateSync}>
        Simulate BLE Thermal Handshake
      </button>

      {status && <p className="status-line">{status}</p>}
    </div>
  );
}

async function hashDeviceId(rawId) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${rawId}MedVerify_SecureSalt_2026`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ConsumerDashboard() {
  const [deviceId, setDeviceId] = useState('user-device-abc');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const [scannedData, setScannedData] = useState({ gtin: '', serial: '' });

  const executeVerification = async (scannedGtin, scannedSerial) => {
    setVerificationResult({ color: '#333', fontColor: '#fff', text: 'Verifying with Supabase...' });

    const hashedDeviceToken = await hashDeviceId(deviceId);

    const { data: item, error } = await supabase
      .from('child_items')
      .select('*, parent_shipments(is_compromised, status)')
      .eq('gtin', scannedGtin)
      .eq('serial', scannedSerial)
      .single();

    if (error || !item) {
      setVerificationResult({ color: '#b91c1c', fontColor: '#fff', text: '🔴 RED ALERT: Invalid Serial Number' });
      return;
    }

    if (item.parent_shipments?.is_compromised) {
      setVerificationResult({ color: '#b91c1c', fontColor: '#fff', text: '🔴 RED ALERT: Thermal Breach Detected' });
      return;
    }

    if (item.status === 'BURNED_ANOMALY') {
      setVerificationResult({ color: '#b91c1c', fontColor: '#fff', text: '🔴 RED ALERT: Product Flagged as Clone' });
      return;
    }

    if (item.status === 'RECEIVED_AT_PHARMACY' || item.status === 'ACTIVATED') {
      if (!item.device_id_hash) {
        await supabase
          .from('child_items')
          .update({ status: 'ACTIVATED', device_id_hash: hashedDeviceToken })
          .match({ gtin: scannedGtin, serial: scannedSerial });

        setVerificationResult({ color: '#047857', fontColor: '#fff', text: '🟢 GREEN: Authentic & Safe' });
        return;
      }

      if (item.device_id_hash === hashedDeviceToken) {
        setVerificationResult({ color: '#047857', fontColor: '#fff', text: '🟢 GREEN: Scanned by you' });
        return;
      }

      await supabase
        .from('child_items')
        .update({ status: 'BURNED_ANOMALY' })
        .match({ gtin: scannedGtin, serial: scannedSerial });

      setVerificationResult({ color: '#b91c1c', fontColor: '#fff', text: '🔴 RED ALERT: Anomalous Scan Detected' });
      return;
    }

    setVerificationResult({ color: '#b45309', fontColor: '#fff', text: '🟡 YELLOW: Data Incomplete' });
  };

  const handleScan = (detectedCodes) => {
    if (!detectedCodes || detectedCodes.length === 0) {
      return;
    }

    const rawText = detectedCodes[0].rawValue;
    const urlParts = rawText.split('/');
    const gtinIndex = urlParts.indexOf('01') + 1;
    const serialIndex = urlParts.indexOf('21') + 1;

    if (gtinIndex > 0 && serialIndex > 0 && urlParts[gtinIndex] && urlParts[serialIndex]) {
      setIsScanning(false);
      const extractedGtin = urlParts[gtinIndex];
      const extractedSerial = urlParts[serialIndex];
      setScannedData({ gtin: extractedGtin, serial: extractedSerial });
      executeVerification(extractedGtin, extractedSerial);
      return;
    }

    setIsScanning(false);
    setVerificationResult({ color: '#b91c1c', fontColor: '#fff', text: '🔴 RED ALERT: Invalid GS1 Format' });
  };

  const handleScanFromRaw = (rawText) => {
    if (rawText) {
      handleScan([{ rawValue: rawText }]);
      return;
    }

    setVerificationResult({ color: '#b91c1c', fontColor: '#fff', text: '🔴 RED ALERT: No code detected in image' });
  };

  return (
    <div className="workflow-panel">
      <label>
        Simulated Device ID
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="user-device-abc">Device A (Original Phone)</option>
          <option value="user-device-xyz">Device B (Cloner Phone)</option>
        </select>
      </label>

      {isScanning ? (
        <div className="scanner-frame">
          <QRScanner onDetected={handleScanFromRaw} verbose={false} />
        </div>
      ) : (
        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            setIsScanning(true);
            setVerificationResult(null);
            setScannedData({ gtin: '', serial: '' });
          }}
        >
          Scan Another Item
        </button>
      )}

      {scannedData.gtin && (
        <p className="status-line">
          <strong>Detected GTIN:</strong> {scannedData.gtin} | <strong>Serial:</strong> {scannedData.serial}
        </p>
      )}

      {verificationResult && (
        <div
          className="verification-result"
          style={{ backgroundColor: verificationResult.color, color: verificationResult.fontColor }}
        >
          {verificationResult.text}
        </div>
      )}
    </div>
  );
}
