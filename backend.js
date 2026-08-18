// ConstantQuest — Supabase backend layer
// All network/auth/database calls live here so app.js stays UI-focused.
'use strict';

// The Supabase SDK loads from a CDN — if that fails (offline, blocked,
// ad blocker) the whole app must still work in guest/local-storage mode
// rather than crashing on load.
const sdkAvailable = typeof window.supabase !== 'undefined';
const sb = sdkAvailable ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const Backend = (() => {

  function requireClient() {
    if (!sb) throw new Error('Could not reach Supabase — check your internet connection and reload.');
  }

  function isConfigured() {
    return sdkAvailable && SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-PROJECT-REF');
  }

  /* ---------------- Auth ---------------- */

  async function createProfile(userId, username) {
    requireClient();
    const { error } = await sb.from('profiles').insert({ id: userId, username });
    if (error) {
      if (error.code === '23505') throw new Error('That username is already taken.');
      throw error;
    }
  }

  async function signUp(email, password, username) {
    requireClient();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
      // no email confirmation required — we're logged in immediately
      await createProfile(data.user.id, username);
      return data;
    }

    // email confirmation required: stash the username and finish setup
    // on first successful login (see signIn below)
    localStorage.setItem('cq_pending_username_' + email, username);
    throw new Error('Account created! Check your email to confirm it, then log in.');
  }

  async function signIn(email, password) {
    requireClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const pendingKey = 'cq_pending_username_' + email;
    const pendingUsername = localStorage.getItem(pendingKey);
    if (pendingUsername) {
      const { data: existing } = await sb.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
      if (!existing) {
        try { await createProfile(data.user.id, pendingUsername); } catch (e) { /* handled via completeProfile flow */ }
      }
      localStorage.removeItem(pendingKey);
    }
    return data;
  }

  async function completeProfile(userId, username) {
    return createProfile(userId, username);
  }

  async function signOut() {
    requireClient();
    await sb.auth.signOut();
  }

  async function getSession() {
    requireClient();
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  function onAuthStateChange(cb) {
    requireClient();
    sb.auth.onAuthStateChange((_event, session) => cb(session));
  }

  async function getProfile(userId) {
    requireClient();
    const { data, error } = await sb
      .from('profiles')
      .select('id, username')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }

  /* ---------------- Progress ---------------- */

  async function fetchAllProgress(userId) {
    requireClient();
    const { data, error } = await sb
      .from('progress')
      .select('constant_id, difficulty_id, best_streak, perfect, attempts')
      .eq('user_id', userId);
    if (error) throw error;
    return data;
  }

  async function upsertProgress(userId, constantId, difficultyId, bestStreak, perfect, attempts) {
    requireClient();
    const { error } = await sb
      .from('progress')
      .upsert({
        user_id: userId,
        constant_id: constantId,
        difficulty_id: difficultyId,
        best_streak: bestStreak,
        perfect,
        attempts,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,constant_id,difficulty_id' });
    if (error) throw error;
  }

  /* ---------------- Friends ---------------- */

  async function searchUsers(query, excludeUserId) {
    requireClient();
    const { data, error } = await sb
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${query}%`)
      .neq('id', excludeUserId)
      .limit(10);
    if (error) throw error;
    return data;
  }

  async function listFriendships(userId) {
    requireClient();
    const { data, error } = await sb
      .from('friendships')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) throw error;
    return data;
  }

  async function sendFriendRequest(userId, targetUserId) {
    requireClient();
    // if the other person already sent us a pending request, accept it instead
    const { data: reverse, error: reverseErr } = await sb
      .from('friendships')
      .select('id, status')
      .eq('requester_id', targetUserId)
      .eq('addressee_id', userId)
      .maybeSingle();
    if (reverseErr) throw reverseErr;

    if (reverse) {
      if (reverse.status === 'pending') return respondToRequest(reverse.id, true);
      return; // already friends
    }

    const { error } = await sb
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: targetUserId });
    if (error) {
      if (error.code === '23505') throw new Error('Friend request already sent.');
      throw error;
    }
  }

  async function respondToRequest(friendshipId, accept) {
    requireClient();
    if (accept) {
      const { error } = await sb
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) throw error;
    } else {
      const { error } = await sb
        .from('friendships')
        .delete()
        .eq('id', friendshipId);
      if (error) throw error;
    }
  }

  async function removeFriend(friendshipId) {
    requireClient();
    const { error } = await sb.from('friendships').delete().eq('id', friendshipId);
    if (error) throw error;
  }

  async function getUsernamesByIds(ids) {
    requireClient();
    if (!ids.length) return {};
    const { data, error } = await sb
      .from('profiles')
      .select('id, username')
      .in('id', ids);
    if (error) throw error;
    const map = {};
    data.forEach(p => { map[p.id] = p.username; });
    return map;
  }

  /* ---------------- Leaderboard ---------------- */

  async function fetchLeaderboard(constantId, difficultyId, userIds) {
    requireClient();
    let q = sb
      .from('leaderboard_entries')
      .select('user_id, username, best_streak, perfect, attempts')
      .eq('constant_id', constantId)
      .eq('difficulty_id', difficultyId)
      .order('best_streak', { ascending: false })
      .order('attempts', { ascending: true })
      .limit(50);
    if (userIds) q = q.in('user_id', userIds);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  return {
    isConfigured, signUp, signIn, signOut, getSession, onAuthStateChange, getProfile, completeProfile,
    fetchAllProgress, upsertProgress,
    searchUsers, listFriendships, sendFriendRequest, respondToRequest, removeFriend, getUsernamesByIds,
    fetchLeaderboard
  };
})();
