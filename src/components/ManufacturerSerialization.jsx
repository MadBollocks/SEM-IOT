// src/components/ManufacturerSerialization.jsx
import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { renderTemplate } from '../utils/labelTemplate';
import { generateQRDataUrl, exportCSV, exportZip, exportPDF } from '../utils/exporters';

// Default label template (HTML free text placeholders)
const DEFAULT_TEMPLATE = `
{{medicine_name}}
Batch: {{batch_number}}
Serial: {{serial_number}}
Expiry: {{expiry_date}}
QR: {{qr}}
`.trim();

export default function ManufacturerSerialization() {
  const [gtin, setGtin] = useState('00312345678906');
  const [quantity, setQuantity] = useState(50);
  const [batchNumber, setBatchNumber] = useState(`BATCH-${Math.floor(100000 + Math.random() * 900000)}`);
  const [medicineName, setMedicineName] = useState('DemoMed 200mg');
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [labelsPreview, setLabelsPreview] = useState([]); // small array for preview
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const labelsRef = useRef([]); // full generated labels (keeps in memory)

  // utility: generate serials padded to 6 digits
  function makeSerial(i) {
    return String(i).padStart(6, '0');
  }

  // Build GS1 QR text: keep same format used elsewhere
  function buildQrText(gtinVal, serial) {
    return `https://medverify.app/01/${gtinVal}/21/${serial}`;
  }

  // Replace the existing generateLabelsAndInsert with this improved version
// Replace the existing generateLabelsAndInsert with this fixed version
async function generateLabelsAndInsert() {
  if (!gtin || !quantity || !batchNumber) {
    setStatus('Fill required fields');
    return;
  }

  setIsGenerating(true);
  setStatus('Preparing to create batch...');
  setGeneratedCount(0);
  setProgress(0);
  labelsRef.current = [];
  setLabelsPreview([]);

  // 1) Upsert parent shipment metadata (insert or update existing)
  const parentPayload = {
    sscc: batchNumber,
    status: 'IN_TRANSIT',
    is_compromised: false,
    medicine_name: medicineName || null,
    expiry_date: expiryDate || null,
    batch_number: batchNumber
  };

  try {
    // use upsert on sscc so re-running doesn't fail if batch exists
    const { error: upsertParentErr } = await supabase
      .from('parent_shipments')
      .upsert([parentPayload], { onConflict: 'sscc' });

    if (upsertParentErr) {
      console.error('Parent upsert error', upsertParentErr);
      setIsGenerating(false);
      setStatus(`Parent upsert error: ${upsertParentErr.message || JSON.stringify(upsertParentErr)}`);
      return;
    }
  } catch (err) {
    console.error('Parent upsert exception', err);
    setIsGenerating(false);
    setStatus(`Parent upsert exception: ${err.message || String(err)}`);
    return;
  }

  // 2) Generate child items in DB in batches and also prepare label data for exports
  const CHUNK = 500; // tune as needed
  let inserted = 0;

  try {
    for (let start = 1; start <= quantity; start += CHUNK) {
      const chunkEnd = Math.min(quantity, start + CHUNK - 1);
      const children = [];
      const previewChunk = [];

      for (let i = start; i <= chunkEnd; i++) {
        const serial = makeSerial(i);
        children.push({
          gtin,
          serial,
          parent_sscc: batchNumber,
          status: 'IN_TRANSIT'
        });

        const qrText = buildQrText(gtin, serial);
        const labelCtx = {
          qr: qrText,
          serial_number: serial,
          batch_number: batchNumber,
          medicine_name: medicineName,
          expiry_date: expiryDate
        };
        previewChunk.push({
          serial_number: serial,
          batch_number: batchNumber,
          medicine_name: medicineName,
          expiry_date: expiryDate,
          qr_text: qrText,
          rendered: renderTemplate(template, labelCtx)
        });
      }

      // Insert/upsert children chunk into DB
      // use upsert with onConflict ['gtin','serial'] so duplicates don't abort
      const { error: childErr } = await supabase
        .from('child_items')
        .upsert(children, { onConflict: ['gtin', 'serial'] });

      if (childErr) {
        // Log full error and stop with helpful message
        console.error(`Child upsert error for ${start}-${chunkEnd}`, childErr);
        setIsGenerating(false);
        setStatus(`Error inserting children ${start}-${chunkEnd}: ${childErr.message || JSON.stringify(childErr)}`);
        return;
      }

      // append to labelsRef
      labelsRef.current = labelsRef.current.concat(previewChunk);
      inserted += previewChunk.length;
      setGeneratedCount(inserted);
      setProgress(inserted / quantity);
      setLabelsPreview(labelsRef.current.slice(0, 8));

      // yield to event loop so UI updates and browser stays responsive
      await new Promise(r => setTimeout(r, 25));
    }

    setIsGenerating(false);
    setStatus(`✅ Generated ${inserted} items for batch ${batchNumber}`);
  } catch (err) {
    console.error('Unexpected generation error', err);
    setIsGenerating(false);
    setStatus(`Unexpected error: ${err.message || String(err)}`);
  }
}

  // Preview first N labels (renders QR images + template text)
  async function buildPreviewWithQrs() {
    const preview = labelsRef.current.slice(0, 12);
    const withQrs = [];
    for (let i = 0; i < preview.length; i++) {
      const p = preview[i];
      // generate SVG data URL for small preview
      try {
        const { dataUrl, svg } = await generateQRDataUrl(p.qr_text, { type: 'png', scale: 4 });
        withQrs.push({ ...p, qrDataUrl: dataUrl });
      } catch (err) {
        withQrs.push({ ...p, qrDataUrl: null });
      }
    }
    setLabelsPreview(withQrs);
  }

  // Exports
  async function handleExportCSV() {
    if (!labelsRef.current.length) return setStatus('No labels to export');
    setStatus('Preparing CSV...');
    exportCSV(labelsRef.current.map(l => ({
      serial_number: l.serial_number,
      batch_number: l.batch_number,
      medicine_name: l.medicine_name,
      expiry_date: l.expiry_date,
      qr_text: l.qr_text
    })), `${batchNumber}_labels.csv`);
    setStatus('CSV exported');
  }

  async function handleExportZipPNG() {
    if (!labelsRef.current.length) return setStatus('No labels to export');
    setStatus('Preparing ZIP (PNG)...');
    await exportZip(labelsRef.current.map(l => ({
      serial_number: l.serial_number,
      batch_number: l.batch_number,
      medicine_name: l.medicine_name,
      expiry_date: l.expiry_date,
      qr_text: l.qr_text
    })), { includePNG: true, includeSVG: false, filename: `${batchNumber}_png.zip`, onProgress: p => setProgress(p) });
    setStatus('ZIP (PNG) exported');
  }

  async function handleExportZipSVGPNG() {
    if (!labelsRef.current.length) return setStatus('No labels to export');
    setStatus('Preparing ZIP (SVG+PNG)...');
    await exportZip(labelsRef.current.map(l => ({
      serial_number: l.serial_number,
      batch_number: l.batch_number,
      medicine_name: l.medicine_name,
      expiry_date: l.expiry_date,
      qr_text: l.qr_text
    })), { includePNG: true, includeSVG: true, filename: `${batchNumber}_svg_png.zip`, onProgress: p => setProgress(p) });
    setStatus('ZIP exported');
  }

  async function handleExportPDF() {
    if (!labelsRef.current.length) return setStatus('No labels to export');
    setStatus('Preparing PDF...');
    await exportPDF(labelsRef.current.map(l => ({
      serial_number: l.serial_number,
      batch_number: l.batch_number,
      medicine_name: l.medicine_name,
      expiry_date: l.expiry_date,
      qr_text: l.qr_text
    })), { filename: `${batchNumber}_labels.pdf`, onProgress: p => setProgress(p) });
    setStatus('PDF exported');
  }

  // Simple CSV of labels only (fast)
  async function handlePreviewAndGenerateQrs() {
    if (!labelsRef.current.length) return setStatus('No labels generated yet');
    setStatus('Generating preview QR images...');
    setIsGenerating(true);
    setProgress(0);
    await buildPreviewWithQrs();
    setIsGenerating(false);
    setProgress(1);
    setStatus('Preview ready');
  }

  return (
    <div>
      <h2>Manufacturer Serialization</h2>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <label>GTIN: <input value={gtin} onChange={(e) => setGtin(e.target.value)} /></label>
          <br />
          <label>Medicine name: <input value={medicineName} onChange={(e) => setMedicineName(e.target.value)} /></label>
          <br />
          <label>Expiry date: <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></label>
          <br />
          <label>Batch Number (SSCC): <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /></label>
          <br />
          <label>Quantity: <input type="number" value={quantity} min={1} onChange={(e) => setQuantity(Number(e.target.value))} /></label>

          <div style={{ marginTop: 12 }}>
            <button onClick={generateLabelsAndInsert} disabled={isGenerating} style={{ marginRight: 8 }}>
              {isGenerating ? 'Generating...' : 'Create Batch & Generate Serials'}
            </button>
            <button onClick={handlePreviewAndGenerateQrs} disabled={isGenerating || !labelsRef.current.length}>
              Preview QR (first page)
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong>Status:</strong> {status}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ height: 10, width: '100%', background: '#eee', borderRadius: 4 }}>
              <div style={{ height: '100%', width: `${(progress || 0) * 100}%`, background: '#10B981', borderRadius: 4 }} />
            </div>
            <div style={{ marginTop: 6 }}>{generatedCount} / {quantity}</div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h4>Label Template</h4>
          <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={8} style={{ width: '100%' }} />
          <div style={{ marginTop: 8 }}>
            <button onClick={() => { setTemplate(DEFAULT_TEMPLATE); }}>Reset Template</button>
          </div>

          <h4 style={{ marginTop: 16 }}>Export</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleExportCSV}>Export CSV</button>
            <button onClick={handleExportZipPNG}>Export ZIP (PNG)</button>
            <button onClick={handleExportZipSVGPNG}>Export ZIP (SVG+PNG)</button>
            <button onClick={handleExportPDF}>Export PDF</button>
          </div>

          <h4 style={{ marginTop: 16 }}>Preview (first items)</h4>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {labelsPreview && labelsPreview.length ? labelsPreview.map((p) => (
              <div key={p.serial_number} style={{ border: '1px solid #ccc', padding: 8, width: 180 }}>
                {p.qrDataUrl ? <img src={p.qrDataUrl} style={{ width: '100%', height: 'auto' }} alt="QR" /> : <div style={{ height: 120, background: '#f5f5f5' }} />}
                <div style={{ marginTop: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>{p.rendered || renderTemplate(template, p)}</div>
              </div>
            )) : <div>No preview yet (generate first)</div>}
          </div>
        </div>
      </div>
    </div>
  );
}