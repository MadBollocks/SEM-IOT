import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import QRScanner from './components/QRScanner';

export default function App() {
  const [activeTab, setActiveTab] = useState('manufacturer');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '20px auto', padding: '20px' }}>
      <h1>MedVerify & ColdGuard Prototype</h1>
      
      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={() => setActiveTab('manufacturer')} 
          style={tabStyle(activeTab === 'manufacturer')}
        >
          1. Manufacturer
        </button>
        <button 
          onClick={() => setActiveTab('pharmacy')} 
          style={tabStyle(activeTab === 'pharmacy')}
        >
          2. Pharmacy Intake
        </button>
        <button 
          onClick={() => setActiveTab('consumer')} 
          style={tabStyle(activeTab === 'consumer')}
        >
          3. Consumer Scan
        </button>
      </div>

      <hr />

      {/* Screen Views */}
      {activeTab === 'manufacturer' && <ManufacturerView />}
      {activeTab === 'pharmacy' && <PharmacySimView />}
      {activeTab === 'consumer' && <ConsumerSimView />}
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

/* ==========================================================================
   1. MANUFACTURER SCREEN (Direct Client-Side Batch Creation)
   ========================================================================== */
function ManufacturerView() {
  const [gtin, setGtin] = useState('00312345678906');
  const [quantity, setQuantity] = useState(50); // Kept modest for fast browser generation
  const [parentSscc, setParentSscc] = useState(`SSCC-${Math.floor(100000 + Math.random() * 900000)}`);
  const [status, setStatus] = useState('');

  const handleGenerateBatch = async (e) => {
    e.preventDefault();
    setStatus('Creating parent batch...');

    // 1. Insert Parent Shipment directly
    const { error: parentErr } = await supabase
      .from('parent_shipments')
      .insert([{ sscc: parentSscc, status: 'IN_TRANSIT', is_compromised: false }]);

    if (parentErr) return setStatus(`❌ Error: ${parentErr.message}`);

    // 2. Generate and Insert Child Serials
    setStatus(`Generating ${quantity} serial items...`);
    const children = [];
    for (let i = 1; i <= quantity; i++) {
      children.push({
        gtin: gtin,
        serial: i.toString().padStart(6, '0'),
        parent_sscc: parentSscc,
        status: 'IN_TRANSIT'
      });
    }

    const { error: childErr } = await supabase.from('child_items').insert(children);
    if (childErr) return setStatus(`❌ Error inserting children: ${childErr.message}`);

    setStatus(`✅ Batch created successfully! SSCC: ${parentSscc}`);
  };

  return (
    <div>
      <h2>Manufacturer Admin</h2>
      <form onSubmit={handleGenerateBatch} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
        <label>GTIN: <input type="text" value={gtin} onChange={(e) => setGtin(e.target.value)} required /></label>
        <label>Quantity: <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required /></label>
        <label>Parent SSCC: <input type="text" value={parentSscc} onChange={(e) => setParentSscc(e.target.value)} required /></label>
        <button type="submit" style={{ padding: '10px', background: '#0070f3', color: '#fff', border: 'none' }}>
          Generate Batch & Items
        </button>
      </form>
      {status && <p><strong>{status}</strong></p>}
    </div>
  );
}

/* ==========================================================================
   2. PHARMACY INTAKE SCREEN (Hardware Simulator)
   ========================================================================== */
function PharmacySimView() {
  const [sscc, setSscc] = useState('');
  const [minTemp, setMinTemp] = useState(3.0);
  const [maxTemp, setMaxTemp] = useState(7.5);
  const [status, setStatus] = useState('');

  const handleSimulateSync = async () => {
    if (!sscc) return alert('Enter an SSCC code');
    setStatus('Syncing environmental payload...');

    // Check if shipment was breached (e.g., standard cold chain is 2°C - 8°C)
    const isCompromised = minTemp < 2.0 || maxTemp > 8.0;

    // 1. Log Thermal Audit Data
    const { error: logErr } = await supabase.from('thermal_logs').insert([{
      parent_sscc: sscc,
      min_temp: minTemp,
      max_temp: maxTemp,
      out_of_bounds_duration: isCompromised ? 120 : 0
    }]);

    if (logErr) return setStatus(`❌ Logging failed: ${logErr.message}`);

    // 2. Update Parent State & Safety Flag
    const { error: parentErr } = await supabase
      .from('parent_shipments')
      .update({ status: 'RECEIVED_AT_PHARMACY', is_compromised: isCompromised })
      .eq('sscc', sscc);

    if (parentErr) return setStatus(`❌ Parent update failed: ${parentErr.message}`);

    // 3. Update all linked child items state to RECEIVED_AT_PHARMACY
    await supabase.from('child_items').update({ status: 'RECEIVED_AT_PHARMACY' }).eq('parent_sscc', sscc);

    if (isCompromised) {
      setStatus(`🔴 Handoff complete with BREACH ALERT. Max temp reached ${maxTemp}°C.`);
    } else {
      setStatus(`🟢 Handoff complete! Cold-chain verified safe.`);
    }
  };

  return (
    <div>
      <h2>Pharmacy Intake (Simulated BLE Sync)</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
        <label>Parent SSCC Code: <input type="text" placeholder="SSCC-XXXXXX" value={sscc} onChange={(e) => setSscc(e.target.value)} /></label>
        
        <div style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '5px' }}>
          <h4>Simulated Sensor Hardware Readings:</h4>
          <label>Min Temp (°C): <input type="number" step="0.1" value={minTemp} onChange={(e) => setMinTemp(Number(e.target.value))} /></label>
          <br /><br />
          <label>Max Temp (°C): <input type="number" step="0.1" value={maxTemp} onChange={(e) => setMaxTemp(Number(e.target.value))} /></label>
        </div>

        <button onClick={handleSimulateSync} style={{ padding: '10px', background: '#10B981', color: '#fff', border: 'none' }}>
          Simulate BLE Thermal Handshake
        </button>
      </div>
      {status && <p><strong>{status}</strong></p>}
    </div>
  );
}

/* ==========================================================================
   3. CONSUMER VERIFICATION SCREEN (Stateful Serialization UI)
   ========================================================================== */
async function hashDeviceId(rawId) {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawId + "MedVerify_SecureSalt_2026"); 
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function ConsumerSimView() {
  const [deviceId, setDeviceId] = useState('user-device-abc');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const [scannedData, setScannedData] = useState({ gtin: '', serial: '' });

  const executeVerification = async (scannedGtin, scannedSerial) => {
    setVerificationResult({ color: '#333', fontColor: '#FFF', text: 'Verifying with Supabase...' });

    // Hash the ID locally before database comparison
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
        // Store only the irreversible hash in the database
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

  // Reuse existing GS1 parsing logic: handleScan expects detectedCodes array
  const handleScan = (detectedCodes) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const rawText = detectedCodes[0].rawValue;
      
      // Expected GS1 Syntax: https://medverify.app/01/{gtin}/21/{serial}
      const urlParts = rawText.split('/');
      const gtinIndex = urlParts.indexOf('01') + 1;
      const serialIndex = urlParts.indexOf('21') + 1;

      if (gtinIndex > 0 && serialIndex > 0 && urlParts[gtinIndex] && urlParts[serialIndex]) {
        setIsScanning(false); // Turn off camera
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

  // This handles raw decoded strings from QRScanner
  const handleScanFromRaw = (rawText) => {
    if (rawText) {
      handleScan([{ rawValue: rawText }]);
    } else {
      setVerificationResult({ color: '#B91C1C', fontColor: '#FFFFFF', text: '🔴 RED ALERT: No code detected in image' });
    }
  };

  return (
    <div>
      <h2>Consumer Scan Verification</h2>
      
      <div style={{ marginBottom: '20px', maxWidth: '400px' }}>
        <label>Simulated Device ID: 
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ marginLeft: '10px', padding: '5px' }}>
            <option value="user-device-abc">Device A (Original Phone)</option>
            <option value="user-device-xyz">Device B (Cloner Phone)</option>
          </select>
        </label>
      </div>

      {isScanning ? (
        <div style={{ maxWidth: '400px', border: '4px solid #333', borderRadius: '8px', overflow: 'hidden' }}>
          <QRScanner
            onDetected={(rawText) => {
              handleScanFromRaw(rawText);
            }}
            verbose={false}
          />
        </div>
      ) : (
        <button 
          onClick={() => {
            setIsScanning(true);
            setVerificationResult(null);
            setScannedData({ gtin: '', serial: '' });
          }} 
          style={{ padding: '10px 20px', background: '#0056B3', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '5px' }}
        >
          Scan Another Item
        </button>
      )}

      {scannedData.gtin && (
        <p style={{ marginTop: '15px' }}>
          <strong>Detected GTIN:</strong> {scannedData.gtin} | <strong>Serial:</strong> {scannedData.serial}
        </p>
      )}

      {verificationResult && (
        <div style={{ 
          marginTop: '20px', 
          padding: '20px', 
          borderRadius: '8px', 
          backgroundColor: verificationResult.color, 
          color: verificationResult.fontColor, 
          fontWeight: 'bold',
          fontSize: '18px',
          textAlign: 'center',
          border: '2px solid rgba(0,0,0,0.1)'
        }}>
          {verificationResult.text}
        </div>
      )}
    </div>
  );
}