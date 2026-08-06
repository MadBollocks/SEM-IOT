// src/App.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import ManufacturerSerialization from './components/ManufacturerSerialization';
import QRScanner from './components/QRScanner';
import PharmacyHandoff from './components/PharmacyHandoff';

// Keep or import other existing components if you prefer
// (ManufacturerView removed — we use ManufacturerSerialization)

export default function App() {
  const [activeTab, setActiveTab] = useState('manufacturer');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Keep user session on reload
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user ?? null);
      if (data?.session?.user) {
        // fetch profile if exists
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).single().catch(() => ({ data: null }));
        setProfile(profileData ?? null);
      }
    })();
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '20px auto', padding: '20px' }}>
      <h1>MedVerify & ColdGuard Prototype</h1>

      <Auth onUser={setUser} onProfile={setProfile} />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('manufacturer')} style={tabStyle(activeTab === 'manufacturer')}>1. Manufacturer</button>
        <button onClick={() => setActiveTab('pharmacy')} style={tabStyle(activeTab === 'pharmacy')}>2. Pharmacy Intake</button>
        <button onClick={() => setActiveTab('consumer')} style={tabStyle(activeTab === 'consumer')}>3. Consumer Scan</button>
      </div>

      <hr />

      {activeTab === 'manufacturer' && (
        <div>
          <h2>Manufacturer</h2>
          {profile?.role === 'manufacturer' ? (
            <ManufacturerSerialization profile={profile} />
          ) : (
            <div style={{ padding: 12, border: '1px dashed #ddd' }}>
              <p>You need a Manufacturer profile to access serialization features.</p>
              <p>Set your role to "Manufacturer" in the Authentication panel above (Create / Update Profile).</p>
              <p>If you are demonstrating: sign in with the manufacturer's email and create your profile with role = <strong>manufacturer</strong>.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pharmacy' && (
        <div>
          <h2>Pharmacy Intake</h2>
          {profile?.role === 'pharmacy' ? (
            <PharmacyHandoff />
          ) : (
            <div style={{ padding: 12, border: '1px dashed #ddd' }}>
              <p>You need a Pharmacy profile to perform handoff. Set role to <strong>pharmacy</strong> in the Authentication panel.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'consumer' && (
        <div>
          <h2>Consumer Scan</h2>
          <p>Signed in as: {user?.email ?? 'guest'} — role: {profile?.role ?? 'none'}</p>
          <ConsumerScanWrapper profile={profile} />
        </div>
      )}
    </div>
  );
}

function ConsumerScanWrapper({ profile }) {
  const [deviceId, setDeviceId] = useState('user-device-abc');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const [scannedData, setScannedData] = useState({ gtin: '', serial: '' });

  async function hashDeviceId(rawId) {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawId + 'MedVerify_SecureSalt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const executeVerification = async (scannedGtin, scannedSerial) => {
    if (!profile) {
      setVerificationResult({ color: '#B45309', fontColor: '#fff', text: 'Please sign in and create a profile (customer) before verifying.' });
      return;
    }

    setVerificationResult({ color: '#333', fontColor: '#FFF', text: 'Verifying with Supabase...' });

    const hashedDeviceToken = await hashDeviceId(deviceId);

    const { data: item, error } = await supabase
      .from('child_items')
      .select('*, parent_shipments(is_compromised, status)')
      .eq('gtin', scannedGtin)
      .eq('serial', scannedSerial)
      .single();

    if (error || !item) {
      return setVerificationResult({ color: '#B91C1C', fontColor: '#FFFFFF', text: '🔴 RED ALERT: Invalid Serial Number' });
    }

    if (item.parent_shipments?.is_compromised) {
      return setVerificationResult({ color: '#B91C1C', fontColor: '#FFFFFF', text: '🔴 RED ALERT: Thermal Breach Detected' });
    }

    if (item.status === 'BURNED_ANOMALY') {
      return setVerificationResult({ color: '#B91C1C', fontColor: '#FFFFFF', text: '🔴 RED ALERT: Product Flagged as Clone' });
    }

    if (item.status === 'RECEIVED_AT_PHARMACY' || item.status === 'ACTIVATED') {
      if (!item.device_id_hash) {
        // Bind to device
        await supabase.from('child_items').update({ status: 'ACTIVATED', device_id_hash: hashedDeviceToken }).match({ gtin: scannedGtin, serial: scannedSerial });
        return setVerificationResult({ color: '#047857', fontColor: '#FFFFFF', text: '🟢 GREEN: Authentic & Safe' });
      } else if (item.device_id_hash === hashedDeviceToken) {
        return setVerificationResult({ color: '#047857', fontColor: '#FFFFFF', text: '🟢 GREEN: Scanned by you' });
      } else {
        await supabase.from('child_items').update({ status: 'BURNED_ANOMALY' }).match({ gtin: scannedGtin, serial: scannedSerial });
        return setVerificationResult({ color: '#B91C1C', fontColor: '#FFFFFF', text: '🔴 RED ALERT: Anomalous Scan Detected' });
      }
    }

    return setVerificationResult({ color: '#B45309', fontColor: '#FFFFFF', text: '🟡 YELLOW: Data Incomplete' });
  };

  const handleScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const rawText = detectedCodes[0].rawValue;
      // parse GS1
      const urlParts = rawText.split('/');
      const gtinIndex = urlParts.indexOf('01') + 1;
      const serialIndex = urlParts.indexOf('21') + 1;

      if (gtinIndex > 0 && serialIndex > 0 && urlParts[gtinIndex] && urlParts[serialIndex]) {
        setIsScanning(false);
        const extractedGtin = urlParts[gtinIndex];
        const extractedSerial = urlParts[serialIndex];
        setScannedData({ gtin: extractedGtin, serial: extractedSerial });
        executeVerification(extractedGtin, extractedSerial);
      } else {
        setIsScanning(false);
        setVerificationResult({ color: '#B91C1C', fontColor: '#FFFFFF', text: '🔴 RED ALERT: Invalid GS1 Format' });
      }
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label>Simulated Device ID:
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="user-device-abc">Device A</option>
            <option value="user-device-xyz">Device B</option>
          </select>
        </label>
      </div>

      {isScanning ? (
        <div style={{ maxWidth: 420, border: '4px solid #333', borderRadius: 8, overflow: 'hidden' }}>
          <QRScanner onDetected={(rawText) => { handleScan([{ rawValue: rawText }]); }} />
        </div>
      ) : (
        <button onClick={() => { setIsScanning(true); setVerificationResult(null); setScannedData({ gtin: '', serial: '' }); }}>
          Scan Another Item
        </button>
      )}

      {scannedData.gtin && (
        <p style={{ marginTop: 12 }}>
          <strong>Detected GTIN:</strong> {scannedData.gtin} | <strong>Serial:</strong> {scannedData.serial}
        </p>
      )}

      {verificationResult && (
        <div style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 8,
          backgroundColor: verificationResult.color,
          color: verificationResult.fontColor,
          fontWeight: 'bold',
          fontSize: 16,
          textAlign: 'center'
        }}>
          {verificationResult.text}
        </div>
      )}
    </div>
  );
}

const tabStyle = (isActive) => ({
  padding: '10px 20px',
  cursor: 'pointer',
  background: isActive ? '#0070f3' : '#eee',
  color: isActive ? '#fff' : '#333',
  border: 'none',
  borderRadius: '5px',
  fontWeight: 'bold'
});