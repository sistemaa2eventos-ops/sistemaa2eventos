const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const logger = require('../services/logger');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL) logger.warn('SUPABASE_URL not configured');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

function createClientForUser(token) {
  if (!token) return supabasePublic;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
}

module.exports = { supabaseAdmin, supabasePublic, createClientForUser };
