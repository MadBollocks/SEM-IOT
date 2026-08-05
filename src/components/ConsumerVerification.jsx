// src/components/PharmacyHandoff.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function PharmacyHandoff({ parentSscc }) {
  const [status, setStatus] = useState('Idle');

  const ingestBleData = async () => {
    try {
      // The mobile application interfaces with ColdGuard IoT tags over standard BLE GATT services[cite: 1]
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, // Replace with specific custom characteristicUUID in production[cite: 1]
        optionalServices: ['battery_service'] 
      });

      setStatus('Connecting to ColdGuard tag...');
      const server = await device.gatt.connect();
      
      // Note: App shall parse BLE characteristic payloads containing min temp, max temp, and out-of-bounds duration[cite: 1]
      // Mocking the ESP32 data payload for now:
      const mockMinTemp = 2.5; 
      const mockMaxTemp = 8.1;
      const mockDuration = 0;

      setStatus('Sealing cryptographic ledger...');
      
      const { error } = await supabase
        .from('thermal_logs')
        .insert([{ 
          parent_sscc: parentSscc, 
          min_temp: mockMinTemp, 
          max_temp: mockMaxTemp, 
          out_of_bounds_duration: mockDuration 
        }]);

      if (error) throw error;
      
      // Updates the batch status to RECEIVED_AT_PHARMACY[cite: 1]
      await supabase
        .from('parent_shipments')
        .update({ status: 'RECEIVED_AT_PHARMACY' })
        .eq('sscc', parentSscc);

      setStatus('Handoff Complete ✅');
    } catch (err) {
      console.error(err);
      setStatus('BLE Connection Failed');
    }
  };

  return (
    <div style={{ padding: '20px', background: '#121212', color: '#FFF' }}>
      {/* Features a high-contrast scan button[cite: 1] */}
      <button 
        onClick={ingestBleData}
        style={{ padding: '15px 30px', fontSize: '18px', background: '#00E676', color: '#000', fontWeight: 'bold' }}
      >
        Scan & Sync ColdGuard BLE
      </button>
      <p>Status: {status}</p>
    </div>
  );
}