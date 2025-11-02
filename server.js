const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { v4: uuidv4 } = require('uuid');
// Optional Twilio integration - used only if env vars are provided
let twilioClient = null;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM; // example: "+1234567890" or "whatsapp:+1415..."
const TWILIO_VERIFY_SID = process.env.TWILIO_VERIFY_SID; // optional: Twilio Verify Service SID (starts with 'VA')
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('Twilio configured for OTP sending.');
    if (TWILIO_VERIFY_SID) console.log('Twilio Verify service configured:', TWILIO_VERIFY_SID);
  } catch (err) {
    console.warn('Twilio package not available or failed to initialize:', err.message);
  }
}

const ADMIN_USER = process.env.ADMIN_USER || 'admin123';
const ADMIN_PASS = process.env.ADMIN_PASS || 'securepass123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secure-session-secret';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ 
  secret: SESSION_SECRET,
  resave: true,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function initDb() {
  // Delete existing database file to ensure clean schema
  const fs = require('fs');
  const dbPath = path.join(__dirname, 'data.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS elections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      election_id TEXT,
      name TEXT,
      votes INTEGER DEFAULT 0,
      FOREIGN KEY(election_id) REFERENCES elections(id)
    );

    CREATE TABLE IF NOT EXISTS voters (
      id TEXT PRIMARY KEY,
      voter_id TEXT UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      election_id TEXT,
      participant_id TEXT,
      voter_id TEXT,
      created_at INTEGER
    );
  `);
}

// Admin login
// Voter ID validation function
function isValidVoterId(voterId) {
  return /^V\d{5}$/.test(voterId);
}

// Register voter
app.post('/register-voter', async (req, res) => {
  const { voterId, name } = req.body;

  // Validate voter ID format
  if (!isValidVoterId(voterId)) {
    return res.status(400).json({ error: 'invalid_voter_id', message: 'Voter ID must start with V followed by 5 digits' });
  }

  // Validate name
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'invalid_name', message: 'Please enter a valid name' });
  }

  try {
    // If voter exists, update their name, if not create new entry
    const id = uuidv4();
    await db.run(`
      INSERT OR REPLACE INTO voters (id, voter_id, name, created_at)
      VALUES (?, ?, ?, ?)
    `, id, voterId, name.trim(), Date.now());
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error registering voter:', err);
    res.status(500).json({ error: 'db_error', message: 'Database error occurred' });
  }
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    req.session.adminLoginTime = Date.now();
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ ok: false, error: 'Session error' });
      }
      return res.json({ ok: true });
    });
  } else {
    res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }
});

// Check admin session endpoint
app.get('/admin/check-session', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ ok: true, username: ADMIN_USER });
  } else {
    res.status(401).json({ ok: false });
  }
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'admin_required' });
}

// Get detailed election results
app.get('/admin/election-details/:id', requireAdmin, async (req, res) => {
  try {
    const election = await db.get('SELECT * FROM elections WHERE id = ?', req.params.id);
    if (!election) return res.status(404).json({ error: 'not_found' });

    const votes = await db.all(`
      SELECT v.voter_id, v.created_at, p.name as participantName
      FROM votes v
      JOIN participants p ON v.participant_id = p.id
      WHERE v.election_id = ?
      ORDER BY v.created_at DESC
    `, req.params.id);

    res.json({
      election,
      votes
    });
  } catch (err) {
    console.error('Error fetching election details:', err);
    res.status(500).json({ error: 'db_error' });
  }
});

// Create election with participants
app.post('/admin/elections', requireAdmin, async (req, res) => {
  const { name, participants } = req.body; // participants: array of names
  if (!name || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  const electionId = uuidv4();
  await db.run('INSERT INTO elections (id, name) VALUES (?, ?)', electionId, name);
  const stmt = await db.prepare('INSERT INTO participants (id, election_id, name) VALUES (?, ?, ?)');
  for (const p of participants) {
    const pid = uuidv4();
    await stmt.run(pid, electionId, p);
  }
  await stmt.finalize();
  res.json({ ok: true, electionId });
});

// List elections
app.get('/elections', async (req, res) => {
  const rows = await db.all('SELECT id, name FROM elections');
  res.json(rows);
});

// Get election details and participants
app.get('/elections/:id', async (req, res) => {
  const id = req.params.id;
  const election = await db.get('SELECT id, name FROM elections WHERE id = ?', id);
  if (!election) return res.status(404).json({ error: 'not_found' });
  const parts = await db.all('SELECT id, name, votes FROM participants WHERE election_id = ?', id);
  res.json({ election, participants: parts });
});

// Admin results for an election
app.get('/admin/elections/:id/results', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const election = await db.get('SELECT id, name FROM elections WHERE id = ?', id);
  if (!election) return res.status(404).json({ error: 'not_found' });
  const parts = await db.all('SELECT id, name, votes FROM participants WHERE election_id = ?', id);
  res.json({ election, participants: parts });
});

// Send OTP (simulate sending via console). OTP valid 30 seconds.
// Voter ID format: V + 5 digits (total length 6), e.g. V12345
const VOTER_ID_REGEX = /^V\d{5}$/;
// Phone format: E.164 or whatsapp:E.164 (E.164 ~= +[country][number])
const PHONE_REGEX = /^(?:whatsapp:)?\+[1-9]\d{1,14}$/;

app.post('/send-otp', async (req, res) => {
  let { voterId, phone } = req.body;
  if (!voterId || !phone) return res.status(400).json({ error: 'missing' });
  voterId = voterId.toString().toUpperCase();
  // normalize phone by removing spaces
  phone = phone.toString().replace(/\s+/g, '');
  if (!VOTER_ID_REGEX.test(voterId)) return res.status(400).json({ error: 'invalid_voter_id', hint: 'Format: V followed by 5 digits, e.g. V12345' });
  if (!PHONE_REGEX.test(phone)) return res.status(400).json({ error: 'invalid_phone', hint: 'Use E.164 like +14155552671 or whatsapp:+14155552671' });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 30_000; // 30 seconds
  // Store phone (and whether verify service is used) so verify step can lookup the phone
  const useVerify = !!(twilioClient && TWILIO_VERIFY_SID);
  otpStore.set(voterId, { code: useVerify ? null : code, expiresAt, phone, via: useVerify ? 'verify' : 'local' });

  // If Twilio Verify is configured, prefer that (it manages codes and expiry)
  if (useVerify) {
    try {
      const channel = phone.startsWith('whatsapp:') ? 'whatsapp' : 'sms';
      const to = phone;
      const ver = await twilioClient.verify.services(TWILIO_VERIFY_SID).verifications.create({ to, channel });
      console.log(`Twilio Verify started for ${voterId} -> ${to}. SID=${ver.sid}`);
      return res.json({ ok: true, ttl: 30, via: 'twilio-verify' });
    } catch (err) {
      console.warn('Twilio Verify failed, falling back to console OTP. Error:', err.message);
      // fall through to console fallback
    }
  }

  // Fallback: local OTP (still works, printed to console)
  console.log(`OTP for ${voterId} -> ${code} (valid 30s). Phone: ${phone}`);
  res.json({ ok: true, ttl: 30, via: 'console' });
});

// Verify OTP
app.post('/verify-otp', async (req, res) => {
  let { voterId, code } = req.body;
  if (!voterId || !code) return res.status(400).json({ error: 'missing' });
  voterId = voterId.toString().toUpperCase();
  if (!VOTER_ID_REGEX.test(voterId)) return res.status(400).json({ error: 'invalid_voter_id' });
  const entry = otpStore.get(voterId);
  if (!entry) return res.status(400).json({ error: 'no_otp' });

  // If Verify service was used for this voterId, check via Twilio Verify API
  if (entry.via === 'verify' && twilioClient && TWILIO_VERIFY_SID) {
    try {
      const to = entry.phone;
      const check = await twilioClient.verify.services(TWILIO_VERIFY_SID).verificationChecks.create({ to, code });
      if (check.status !== 'approved') return res.status(400).json({ error: 'invalid_code' });
      // approved -> continue to create voter
    } catch (err) {
      console.warn('Twilio Verify check failed:', err.message);
      return res.status(400).json({ error: 'verify_error', detail: err.message });
    }
  } else {
    // local OTP path
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(voterId);
      return res.status(400).json({ error: 'expired' });
    }
    if (entry.code !== code) return res.status(400).json({ error: 'invalid_code' });
  }

  // Create or update voter record
  const existing = await db.get('SELECT id FROM voters WHERE voter_id = ?', voterId);
  if (!existing) {
    const nid = uuidv4();
    await db.run('INSERT INTO voters (id, voter_id, phone, created_at) VALUES (?, ?, ?, ?)', nid, voterId, entry.phone, Date.now());
  }
  otpStore.delete(voterId);
  res.json({ ok: true });
});

// Vote
app.post('/vote', async (req, res) => {
  const { electionId, participantId, voterId } = req.body;
  if (!electionId || !participantId || !voterId) return res.status(400).json({ error: 'missing' });
  // Ensure voter exists
  const voter = await db.get('SELECT id FROM voters WHERE voter_id = ?', voterId);
  if (!voter) return res.status(403).json({ error: 'voter_not_verified' });
  // Check if already voted in this election
  const already = await db.get('SELECT id FROM votes WHERE election_id = ? AND voter_id = ?', electionId, voterId);
  if (already) return res.status(403).json({ error: 'already_voted' });
  const vid = uuidv4();
  await db.run('INSERT INTO votes (id, election_id, participant_id, voter_id, created_at) VALUES (?, ?, ?, ?, ?)', vid, electionId, participantId, voterId, Date.now());
  await db.run('UPDATE participants SET votes = votes + 1 WHERE id = ?', participantId);
  res.json({ ok: true });
});

// Check if voter has voted in a specific election
app.get('/voter/:voterId/election/:electionId/status', async (req, res) => {
  const { voterId, electionId } = req.params;
  const vote = await db.get('SELECT id FROM votes WHERE voter_id = ? AND election_id = ?', voterId, electionId);
  res.json({ hasVoted: !!vote });
});

// Admin: list all elections with summary
app.get('/admin/elections', requireAdmin, async (req, res) => {
  const elections = await db.all('SELECT id, name FROM elections');
  const result = [];
  for (const e of elections) {
    const parts = await db.all('SELECT name, votes FROM participants WHERE election_id = ?', e.id);
    result.push({ id: e.id, name: e.name, participants: parts });
  }
  res.json(result);
});

// Send a WhatsApp template (or other message with contentSid) via Twilio Messages API
app.post('/send-whatsapp-template', async (req, res) => {
  if (!twilioClient) return res.status(400).json({ error: 'twilio_not_configured' });
  const { to, contentSid, contentVariables } = req.body;
  if (!to || !contentSid) return res.status(400).json({ error: 'missing' });
  // ensure whatsapp 'to' string
  if (!to.startsWith('whatsapp:')) return res.status(400).json({ error: 'invalid_to', hint: "Prefix with 'whatsapp:' e.g. whatsapp:+1415..." });
  // TWILIO_FROM should also be a WhatsApp-enabled Twilio sender (usually 'whatsapp:+1415...')
  if (!TWILIO_FROM || !TWILIO_FROM.startsWith('whatsapp:')) {
    return res.status(400).json({ error: 'invalid_from', hint: 'TWILIO_FROM must be a WhatsApp-enabled Twilio sender (whatsapp:+...)' });
  }
  try {
    const msg = await twilioClient.messages.create({ from: TWILIO_FROM, to, contentSid, contentVariables });
    return res.json({ ok: true, sid: msg.sid });
  } catch (err) {
    console.warn('Twilio send-whatsapp-template failed:', err && err.message);
    return res.status(500).json({ error: 'send_failed', detail: err && err.message });
  }
});

app.listen(PORT, async () => {
  await initDb();
  console.log(`Server listening on http://localhost:${PORT}`);
});
