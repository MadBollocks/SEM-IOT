// src/components/Auth.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Props: onUser(user), onProfile(profile)
// - onUser called with supabase user object or null
// - onProfile called with profile row or null
export default function Auth({ onUser, onProfile }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState(null);
  const [roleChoice, setRoleChoice] = useState('customer');
  const [name, setName] = useState('');

  useEffect(() => {
    // On mount, check initial session
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      onUser && onUser(user);
      if (user) await loadProfile(user.id);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      onUser && onUser(user);
      if (user) {
        await loadProfile(user.id);
      } else {
        setProfile(null);
        onProfile && onProfile(null);
      }
    });

    return () => listener?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(userId) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error && error.code !== 'PGRST116') { /* ignore not found */ }
      setProfile(data ?? null);
      onProfile && onProfile(data ?? null);
    } catch (err) {
      console.error('profile load error', err);
    }
  }

  async function signIn() {
    setStatus('Sending magic link...');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setStatus(`Error: ${error.message}`);
    else setStatus('Magic link sent. Check your email.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setStatus('Signed out');
    setProfile(null);
    onUser && onUser(null);
    onProfile && onProfile(null);
  }

  async function ensureProfileForUser(user) {
    if (!user) return;
    // if profile exists already we loaded it; otherwise create using roleChoice and name
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setProfile(data);
        onProfile && onProfile(data);
        return data;
      }
    } catch (err) {
      // not found or error - proceed to upsert
    }

    // Upsert the profile row (id MUST be auth.uid())
    const payload = {
      id: user.id,
      email: user.email,
      full_name: name || null,
      role: roleChoice,
      org: null
    };

    const { error } = await supabase.from('profiles').upsert(payload, { returning: 'representation' });
    if (error) {
      console.error('profile upsert err', error);
      setStatus(`Profile creation error: ${error.message}`);
      return null;
    }

    // reload profile
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile(data);
    onProfile && onProfile(data);
    setStatus('Profile created');
    return data;
  }

  return (
    <div style={{ marginBottom: 16, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
      <h3>Authentication</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input placeholder="you@school.edu" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button onClick={signIn}>Send Magic Link</button>
        <button onClick={signOut}>Sign Out</button>
      </div>

      <div style={{ marginTop: 8 }}>
        <strong>Status:</strong> {status}
      </div>

      <div style={{ marginTop: 8 }}>
        <p style={{ margin: 0 }}><em>Profile setup (first-time users)</em></p>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={roleChoice} onChange={(e) => setRoleChoice(e.target.value)}>
            <option value="customer">Customer</option>
            <option value="pharmacy">Pharmacy</option>
            <option value="manufacturer">Manufacturer</option>
          </select>
          <button onClick={async () => {
            // get current user and create profile
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return setStatus('Sign in first (send magic link).');
            setStatus('Creating/updating profile...');
            await ensureProfileForUser(user);
          }}>Create / Update Profile</button>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <small>Note: for demo you can assign roles here. In production role assignment is managed by org admin.</small>
      </div>
    </div>
  );
}