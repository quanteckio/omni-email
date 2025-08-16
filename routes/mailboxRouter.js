// mailboxRouter.js (CommonJS) — Express router واحد لإدارة حسابات البريد + إرسال + IMAP + SSE
// المتطلبات: express, @upstash/redis, nodemailer, imapflow, zod, ulid
const { Router } = require("express");
const { Redis } = require("@upstash/redis");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { ImapFlow } = require("imapflow");
const { z } = require("zod");
const { ulid } = require("ulid");
const { EventEmitter } = require("events");
const { simpleParser } = require("mailparser");

// ------------------------- Redis client -------------------------
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ------------------------- Crypto helpers -------------------------
// Envelope للتخزين: AES-256-GCM مع HKDF subkey و AAD لكل سجل
function getMasterKey() {
  const b64 = process.env.CONFIG_MASTER_KEY_BASE64;
  
  console.log(process.env.CONFIG_MASTER_KEY_BASE64);
  if (!b64) throw new Error("CONFIG_MASTER_KEY_BASE64 is required");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("CONFIG_MASTER_KEY_BASE64 must be 32 bytes (base64 of 32 bytes)");
  return key;
}

function hkdfSubkey(salt, info) {
  const master = getMasterKey();
  return crypto.hkdfSync("sha256", master, salt, Buffer.from(info, "utf8"), 32);
}

function encryptJSON(payload, aad) {
  const salt = crypto.randomBytes(16);
  const key = hkdfSubkey(salt, "mailbox:v1");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const pt = Buffer.from(JSON.stringify(payload), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "AES-256-GCM",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
}

function decryptJSON(env, aad) {
  if (!env || env.v !== 1 || env.alg !== "AES-256-GCM") throw new Error("Unsupported envelope");
  const salt = Buffer.from(env.salt, "base64");
  const iv = Buffer.from(env.iv, "base64");
  const tag = Buffer.from(env.tag, "base64");
  const ct = Buffer.from(env.ct, "base64");
  const key = hkdfSubkey(salt, "mailbox:v1");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

// ------------------------- Schemas -------------------------
const ConnType = z.enum(["SSL/TLS", "STARTTLS"]);
const ServerSettings = z.object({
  server: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
  connection: ConnType,
});
const SecretPayload = z.object({
  label: z.string().optional(),
  primaryEmail: z.string().email(),
  imap: ServerSettings,
  smtp: ServerSettings,
});

const CreateAccountSchema = z.object({
  integrationId: z.string().min(1),
  label: z.string().optional(),
  primaryEmail: z.string().email(),
  imap: ServerSettings,
  smtp: ServerSettings,
  testConnection: z.boolean().optional().default(false),
});

const SendSchema = z.object({
  to: z.array(z.string().email()).nonempty(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().default(""),
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentBase64: z.string(),
        contentType: z.string().optional(),
      })
    )
    .optional(),
});

// ------------------------- Utils -------------------------
function maskEmail(email) {
  const [name, domain] = String(email).split("@");
  if (!domain) return "***";
  const n = name.length;
  const masked = n <= 2 ? name[0] + "*" : name[0] + "*".repeat(Math.max(1, n - 2)) + name[n - 1];
  return `${masked}@${domain}`;
}

const kUserIndex = (integrationId) => `mail:user:${integrationId}:accounts`;
const kAccount = (accountId) => `mail:acc:${accountId}`;

async function loadAccount(accountId, mustExist = true) {
  const rec = await redis.get(kAccount(accountId));
  if (!rec && mustExist) throw new Error("Account not found");
  return rec;
}

function smtpTransportFromSecret(secret) {
  const secure = secret.smtp.connection === "SSL/TLS";
  return nodemailer.createTransport({
    host: secret.smtp.server,
    port: secret.smtp.port,
    secure,
    auth: {
      user: secret.smtp.username,
      pass: secret.smtp.password,
    },
    requireTLS: secret.smtp.connection === "STARTTLS",
  });
}

function imapConfigFromSecret(secret) {
  const useSecure = secret.imap.connection === "SSL/TLS";
  return {
    host: secret.imap.server,
    port: secret.imap.port,
    secure: useSecure,
    auth: {
      user: secret.imap.username,
      pass: secret.imap.password,
    },
    logger: false,
    // Add timeout configurations
    connectionTimeout: 30000, // 30 seconds for initial connection
    greetingTimeout: 15000,   // 15 seconds for server greeting
    socketTimeout: 60000,     // 60 seconds for socket operations
    // Additional settings for better reliability
    keepalive: {
      interval: 30000,        // Send keepalive every 30 seconds
      idleInterval: 300000,   // IDLE command interval (5 minutes)
      forceNoop: true         // Force NOOP commands
    }
  };
}

// ------------------------- Live Watch/SSE -------------------------
const watchers = new Map(); // accountId -> Watcher

function broadcast(accountId, data) {
  const w = watchers.get(accountId);
  if (!w) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of w.sseClients) {
    try {
      res.write(payload);
    } catch {}
  }
}

async function stopWatcher(accountId) {
  const w = watchers.get(accountId);
  if (!w) return;
  if (w.stopping) return;
  w.stopping = true;
  try {
    if (w.client) {
      try {
        if (w.client.mailbox) {
          try {
            await w.client.mailboxClose();
          } catch {}
        }
        await w.client.logout();
      } catch {}
    }
  } finally {
    clearTimeout(w.idleTimer);
    w.client = null;
    watchers.delete(accountId);
  }
}

function keepAliveWatcher(w) {
  clearTimeout(w.idleTimer);
  if (w.sseClients.size === 0) {
    w.idleTimer = setTimeout(() => stopWatcher(w.accountId), 60_000);
    return;
  }
  w.idleTimer = setTimeout(() => keepAliveWatcher(w), 5 * 60_000);
}

async function ensureWatcher(accountId) {
  let w = watchers.get(accountId);
  if (w && w.client) return w;

  const acc = await loadAccount(accountId);
  const secret = decryptJSON(acc.enc, `${acc.id}:${acc.integrationId}`);

  const client = new ImapFlow(imapConfigFromSecret(secret));
  const emitter = w?.emitter ?? new EventEmitter();

  w = {
    accountId,
    lastUid: 0,
    client,
    emitter,
    sseClients: w?.sseClients ?? new Set(),
    stopping: false,
    idleTimer: undefined,
  };
  watchers.set(accountId, w);

  client.on("error", (err) => {
    broadcast(accountId, { type: "Error", message: err?.message || String(err) });
  });

  (async () => {
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const status = await client.status("INBOX", { uidNext: true });
      w.lastUid = Math.max(0, ((status.uidNext || 1) - 1));

      client.on("exists", async () => {
        if (!w || !w.client) return;
        try {
          const fromUid = w.lastUid + 1;
          const range = `${fromUid}:*`;
          for await (const msg of w.client.fetch({ uid: range }, {
            envelope: true,
            flags: true,
            internalDate: true,
            uid: true,
          })) {
            const ev = {
              type: "EmailReceived",
              accountId,
              uid: msg.uid,
              subject: msg.envelope?.subject ?? null,
              from: (msg.envelope?.from || []).map((a) => a.address).filter(Boolean),
              to: (msg.envelope?.to || []).map((a) => a.address).filter(Boolean),
              date: msg.internalDate || null,
              flags: Array.from(msg.flags || []),
            };
            w.lastUid = Math.max(w.lastUid, msg.uid);
            broadcast(accountId, ev);
          }
        } catch (e) {
          broadcast(accountId, { type: "Error", message: e?.message || String(e) });
        }
      });

      keepAliveWatcher(w);
      broadcast(accountId, { type: "WatcherReady", accountId });
    } catch (err) {
      broadcast(accountId, { type: "Error", message: err?.message || String(err) });
      await stopWatcher(accountId);
    }
  })();

  return w;
}

// ------------------------- Router -------------------------
const mailboxRouter = Router();

/**
 * @swagger
 * /mailbox/accounts:
 *   post:
 *     tags: [Mailbox]
 *     summary: Create new mailbox account
 *     description: Creates a new mailbox account with IMAP and SMTP configuration. Optionally tests connectivity before storing.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMailboxAccountRequest'
 *           example:
 *             integrationId: 'user123'
 *             label: 'Work Email'
 *             primaryEmail: 'user@company.com'
 *             imap:
 *               server: 'imap.gmail.com'
 *               port: 993
 *               username: 'user@company.com'
 *               password: 'app-password'
 *               connection: 'SSL/TLS'
 *             smtp:
 *               server: 'smtp.gmail.com'
 *               port: 587
 *               username: 'user@company.com'
 *               password: 'app-password'
 *               connection: 'STARTTLS'
 *             testConnection: true
 *     responses:
 *       200:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accountId:
 *                   type: string
 *                   description: Unique identifier for the created account
 *                   example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *       400:
 *         description: Bad request - validation error or connectivity test failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.post("/accounts", async (req, res) => {
  try {
    const body = CreateAccountSchema.parse(req.body);
    const accountId = ulid();
    const secret = {
      label: body.label,
      primaryEmail: body.primaryEmail,
      imap: body.imap,
      smtp: body.smtp,
    };

    // اختياري: اختبار اتصال قبل التخزين
    if (body.testConnection) {
      const transporter = smtpTransportFromSecret(secret);
      await transporter.verify();
      const client = new ImapFlow(imapConfigFromSecret(secret));
      await client.connect();
      await client.logout();
    }

    const aad = `${accountId}:${body.integrationId}`;
    const enc = encryptJSON(secret, aad);
    const now = new Date().toISOString();
    const record = {
      id: accountId,
      integrationId: body.integrationId,
      createdAt: now,
      updatedAt: now,
      enc,
    };

    await redis.set(kAccount(accountId), record);
    await redis.sadd(kUserIndex(body.integrationId), accountId);

    res.json({ accountId });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Bad Request" });
  }
});

/**
 * @swagger
 * /mailbox/accounts:
 *   get:
 *     tags: [Mailbox]
 *     summary: List mailbox accounts for a user
 *     description: Retrieves all mailbox accounts for a specific user with masked email addresses for security.
 *     parameters:
 *       - in: query
 *         name: integrationId
 *         required: true
 *         schema:
 *           type: string
 *         description: User identifier
 *         example: 'user123'
 *     responses:
 *       200:
 *         description: List of user's mailbox accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accounts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MailboxAccount'
 *       400:
 *         description: Bad request - missing integrationId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.get("/accounts", async (req, res) => {
  try {
    const integrationId = String(req.query.integrationId || "");
    if (!integrationId) throw new Error("integrationId is required");
    const ids = await redis.smembers(kUserIndex(integrationId));
    const out = [];
    for (const id of ids) {
      const rec = await loadAccount(id, false);
      if (!rec) continue;
      const secret = decryptJSON(rec.enc, `${rec.id}:${rec.integrationId}`);
      out.push({
        id: rec.id,
        integrationId: rec.integrationId,
        label: secret.label || null,
        primaryEmailMasked: maskEmail(secret.primaryEmail),
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      });
    }
    res.json({ accounts: out });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Bad Request" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}:
 *   get:
 *     tags: [Mailbox]
 *     summary: Get detailed mailbox account information
 *     description: Retrieves full account details including server settings. Passwords are redacted by default unless explicitly requested.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *       - in: query
 *         name: includePasswords
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'false'
 *         description: Whether to include passwords in response
 *         example: 'false'
 *     responses:
 *       200:
 *         description: Account details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MailboxAccountDetail'
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.get("/accounts/:id", async (req, res) => {
  try {
    const acc = await loadAccount(req.params.id);
    if (!acc) return res.status(404).json({ error: "Not found" });
    const includePw = String(req.query.includePasswords || "false") === "true";
    const secret = decryptJSON(acc.enc, `${acc.id}:${acc.integrationId}`);
    const redact = (s) => (includePw ? s : { ...s, password: undefined, hasPassword: true });
    res.json({
      id: acc.id,
      integrationId: acc.integrationId,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
      secret: {
        label: secret.label || null,
        primaryEmail: secret.primaryEmail,
        imap: redact(secret.imap),
        smtp: redact(secret.smtp),
      },
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Bad Request" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}:
 *   put:
 *     tags: [Mailbox]
 *     summary: Update mailbox account configuration
 *     description: Updates the account's server settings and configuration. This replaces the entire secret configuration.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMailboxAccountRequest'
 *     responses:
 *       200:
 *         description: Account updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.put("/accounts/:id", async (req, res) => {
  try {
    const acc = await loadAccount(req.params.id);
    if (!acc) return res.status(404).json({ error: "Not found" });
    const body = SecretPayload.parse(req.body);
    const aad = `${acc.id}:${acc.integrationId}`;
    const enc = encryptJSON(body, aad);
    const updated = {
      ...acc,
      enc,
      updatedAt: new Date().toISOString(),
    };
    await redis.set(kAccount(acc.id), updated);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Bad Request" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}:
 *   delete:
 *     tags: [Mailbox]
 *     summary: Delete mailbox account
 *     description: Permanently deletes a mailbox account and all its associated data.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *     responses:
 *       200:
 *         description: Account deleted successfully (or didn't exist)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.delete("/accounts/:id", async (req, res) => {
  try {
    const acc = await loadAccount(req.params.id, false);
    if (!acc) return res.json({ ok: true });
    await redis.del(kAccount(acc.id));
    await redis.srem(kUserIndex(acc.integrationId), acc.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Bad Request" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}/test:
 *   post:
 *     tags: [Mailbox]
 *     summary: Test IMAP and SMTP connectivity
 *     description: Tests both IMAP and SMTP connectivity for the specified account to verify credentials and server settings.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *     responses:
 *       200:
 *         description: Connectivity test passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Connectivity test failed or account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.post("/accounts/:id/test", async (req, res) => {
  try {
    const acc = await loadAccount(req.params.id);
    const secret = decryptJSON(acc.enc, `${acc.id}:${acc.integrationId}`);
    const transporter = smtpTransportFromSecret(secret);
    await transporter.verify();
    const client = new ImapFlow(imapConfigFromSecret(secret));
    await client.connect();
    await client.logout();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Bad Request" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}/send:
 *   post:
 *     tags: [Mailbox]
 *     summary: Send email via SMTP
 *     description: Sends an email using the account's SMTP configuration. Supports attachments and both plain text and HTML content.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MailboxSendRequest'
 *     responses:
 *       200:
 *         description: Email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MailboxSendResponse'
 *       400:
 *         description: Bad request - validation error or send failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.post("/accounts/:id/send", async (req, res) => {
  try {
    const msg = SendSchema.parse(req.body);
    const acc = await loadAccount(req.params.id);
    const secret = decryptJSON(acc.enc, `${acc.id}:${acc.integrationId}`);
    const transporter = smtpTransportFromSecret(secret);

    const info = await transporter.sendMail({
      from: secret.smtp.username, // أو استخدم secret.primaryEmail حسب مزوّدك
      to: msg.to,
      cc: msg.cc,
      bcc: msg.bcc,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: (msg.attachments || []).map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, "base64"),
        contentType: a.contentType,
      })),
    });

    res.json({ messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (err) {
    res.status(400).json({ error: err?.message || "Bad Request" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}/messages:
 *   get:
 *     tags: [Mailbox]
 *     summary: List recent INBOX messages
 *     description: Retrieves recent messages from the account's INBOX. Can be filtered by date and limited in count.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Maximum number of messages to retrieve
 *         example: 20
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Only retrieve messages newer than this date (ISO 8601 format)
 *         example: '2024-01-01T00:00:00.000Z'
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MailboxMessage'
 *       400:
 *         description: Bad request or account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.get("/accounts/:id/messages", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "20"), 10) || 20, 100);
  const sinceStr = String(req.query.since || "");
  let client = null;
  let lock = null;
  
  try {
    const acc = await loadAccount(req.params.id);
    const secret = decryptJSON(acc.enc, `${acc.id}:${acc.integrationId}`);

    client = new ImapFlow(imapConfigFromSecret(secret));
    
    // Add error handler for the client
    client.on('error', (error) => {
      console.error('IMAP Client Error in messages list:', error.message);
    });
    
    try {
      await client.connect();
    } catch (connectError) {
      throw new Error(`Failed to connect to IMAP server: ${connectError.message}`);
    }
    
    try {
      lock = await client.getMailboxLock("INBOX");
    } catch (lockError) {
      throw new Error(`Failed to acquire mailbox lock: ${lockError.message}`);
    }
    
    const out = [];
    try {
      let seq = [];
      if (sinceStr) {
        const since = new Date(sinceStr);
        seq = await client.search({ since });
      } else {
        const status = await client.status("INBOX", { messages: true, uidNext: true });
        const lastUid = (status.uidNext || 1) - 1;
        const start = Math.max(1, lastUid - limit * 5);
        seq = await client.search({ uid: `${start}:${lastUid}` });
      }
      const uids = seq.slice(-limit);
      
      // Add timeout for fetch operation
      const fetchTimeout = setTimeout(() => {
        throw new Error("Messages fetch operation timed out");
      }, 45000); // 45 second timeout for list operation
      
      try {
        for await (const msg of client.fetch(uids, {
          envelope: true,
          flags: true,
          internalDate: true,
          source: false,
          uid: true,
        })) {
          out.push({
            uid: msg.uid,
            subject: msg.envelope?.subject,
            from: (msg.envelope?.from || []).map((a) => a.address).filter(Boolean),
            to: (msg.envelope?.to || []).map((a) => a.address).filter(Boolean),
            date: msg.internalDate,
            flags: Array.from(msg.flags || []),
          });
        }
        clearTimeout(fetchTimeout);
      } catch (fetchError) {
        clearTimeout(fetchTimeout);
        throw fetchError;
      }
      
    } finally {
      // Always release the lock
      if (lock) {
        try {
          lock.release();
        } catch (lockReleaseError) {
          console.warn("Failed to release mailbox lock:", lockReleaseError.message);
        }
      }
    }

    res.json({ messages: out });
  } catch (err) {
    console.error("Messages list error:", err.message);
    res.status(400).json({ 
      error: err?.message || "Failed to fetch messages",
      code: err?.code || "UNKNOWN_ERROR"
    });
  } finally {
    // Always cleanup the client connection
    if (client) {
      try {
        if (client.connection) {
          await client.logout();
        }
      } catch (logoutError) {
        console.warn("Failed to logout IMAP client:", logoutError.message);
        // Force close if logout fails
        try {
          if (client.connection && client.connection.destroy) {
            client.connection.destroy();
          }
        } catch (destroyError) {
          console.warn("Failed to destroy IMAP connection:", destroyError.message);
        }
      }
    }
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}/messages/{uid}:
 *   get:
 *     tags: [Mailbox]
 *     summary: Fetch single message details
 *     description: Retrieves detailed information for a specific message including metadata and raw RFC822 source.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: integer
 *         description: Message UID
 *         example: 12345
 *       - in: query
 *         name: includeRaw
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *         description: Whether to include raw RFC822 source in response
 *         example: 'false'
 *     responses:
 *       200:
 *         description: Message details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uid:
 *                   type: integer
 *                   description: Message UID
 *                 subject:
 *                   type: string
 *                   description: Message subject
 *                 from:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Sender email addresses
 *                 to:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Recipient email addresses
 *                 date:
 *                   type: string
 *                   format: date-time
 *                   description: Message date
 *                 flags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Message flags
 *                 rfc822:
 *                   type: string
 *                   description: Raw RFC822 email source
 *                 parsed:
 *                   type: object
 *                   description: Parsed and decoded email content
 *                   properties:
 *                     messageId:
 *                       type: string
 *                       description: Message ID
 *                     subject:
 *                       type: string
 *                       description: Parsed subject
 *                     from:
 *                       type: object
 *                       description: Parsed from field
 *                     to:
 *                       type: array
 *                       description: Parsed to field
 *                     text:
 *                       type: string
 *                       description: Plain text content
 *                     html:
 *                       type: string
 *                       description: HTML content
 *                     textAsHtml:
 *                       type: string
 *                       description: Plain text converted to HTML
 *                     attachments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           filename:
 *                             type: string
 *                           contentType:
 *                             type: string
 *                           size:
 *                             type: integer
 *       404:
 *         description: Message not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Bad request or account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.get("/accounts/:id/messages/:uid", async (req, res) => {
  let client = null;
  let lock = null;
  
  try {
    const uid = Number(req.params.uid);
    const includeRaw = String(req.query.includeRaw || "true") === "true";
    const acc = await loadAccount(req.params.id);
    const secret = decryptJSON(acc.enc, `${acc.id}:${acc.integrationId}`);

    client = new ImapFlow(imapConfigFromSecret(secret));
    
    // Add error handler for the client
    client.on('error', (error) => {
      console.error('IMAP Client Error:', error.message);
    });
    
    // Connect with timeout handling
    try {
      await client.connect();
    } catch (connectError) {
      throw new Error(`Failed to connect to IMAP server: ${connectError.message}`);
    }
    
    try {
      lock = await client.getMailboxLock("INBOX");
    } catch (lockError) {
      throw new Error(`Failed to acquire mailbox lock: ${lockError.message}`);
    }
    
    try {
      let meta = null;
      
      // Fetch message with timeout handling
      const fetchTimeout = setTimeout(() => {
        throw new Error("Message fetch operation timed out");
      }, 30000); // 30 second timeout for fetch operation
      
      try {
        for await (const msg of client.fetch({ uid }, { envelope: true, flags: true, internalDate: true, source: true })) {
          meta = msg;
          break; // We only expect one message with this UID
        }
        clearTimeout(fetchTimeout);
      } catch (fetchError) {
        clearTimeout(fetchTimeout);
        throw fetchError;
      }
      
      if (!meta) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      // Parse the RFC822 content to make it readable
      const rfc822Source = meta.source?.toString("utf8") || null;
      let parsedEmail = null;
      
      if (rfc822Source) {
        try {
          parsedEmail = await simpleParser(rfc822Source);
        } catch (parseError) {
          console.warn("Failed to parse email:", parseError.message);
        }
      }
      
      const response = {
        uid: meta.uid,
        subject: meta.envelope?.subject,
        from: (meta.envelope?.from || []).map((a) => a.address).filter(Boolean),
        to: (meta.envelope?.to || []).map((a) => a.address).filter(Boolean),
        date: meta.internalDate,
        flags: Array.from(meta.flags || []),
        parsed: parsedEmail ? {
          messageId: parsedEmail.messageId,
          subject: parsedEmail.subject,
          from: parsedEmail.from,
          to: parsedEmail.to,
          cc: parsedEmail.cc,
          bcc: parsedEmail.bcc,
          date: parsedEmail.date,
          text: parsedEmail.text,
          html: parsedEmail.html ? parsedEmail.html.replace(/[\r\n\t]+/g, '').replace(/\s+/g, ' ').replace(/\\"/g, '"').trim() : null,
          textAsHtml: parsedEmail.textAsHtml,
          attachments: parsedEmail.attachments ? parsedEmail.attachments.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            contentId: att.contentId,
            contentDisposition: att.contentDisposition
          })) : []
        } : null
      };
      
      // Only include raw RFC822 if requested
      if (includeRaw) {
        response.rfc822 = rfc822Source;
      }
      
      res.json(response);
      
    } finally {
      // Always release the lock
      if (lock) {
        try {
          lock.release();
        } catch (lockReleaseError) {
          console.warn("Failed to release mailbox lock:", lockReleaseError.message);
        }
      }
    }
    
  } catch (err) {
    console.error("Message fetch error:", err.message);
    res.status(400).json({ 
      error: err?.message || "Failed to fetch message",
      code: err?.code || "UNKNOWN_ERROR"
    });
  } finally {
    // Always cleanup the client connection
    if (client) {
      try {
        if (client.connection) {
          await client.logout();
        }
      } catch (logoutError) {
        console.warn("Failed to logout IMAP client:", logoutError.message);
        // Force close if logout fails
        try {
          if (client.connection && client.connection.destroy) {
            client.connection.destroy();
          }
        } catch (destroyError) {
          console.warn("Failed to destroy IMAP connection:", destroyError.message);
        }
      }
    }
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}/watch/start:
 *   post:
 *     tags: [Mailbox]
 *     summary: Start email watcher
 *     description: Starts the real-time email watcher for the account. This enables live monitoring of new incoming emails.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *     responses:
 *       200:
 *         description: Watcher started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Failed to start watcher
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.post("/accounts/:id/watch/start", async (req, res) => {
  try {
    await ensureWatcher(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e?.message || "Failed to start watcher" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}/watch/stop:
 *   post:
 *     tags: [Mailbox]
 *     summary: Stop email watcher
 *     description: Stops the real-time email watcher for the account.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
 *     responses:
 *       200:
 *         description: Watcher stopped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Failed to stop watcher
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.post("/accounts/:id/watch/stop", async (req, res) => {
  try {
    await stopWatcher(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e?.message || "Failed to stop watcher" });
  }
});

/**
 * @swagger
 * /mailbox/accounts/{id}/stream:
 *   get:
 *     tags: [Mailbox]
 *     summary: Real-time email events stream (SSE)
 *     description: |
 *       Establishes a Server-Sent Events (SSE) connection for real-time email notifications.
 *       The stream will send events when new emails are received.
 *       
 *       **Usage Example:**
 *       ```javascript
 *       const es = new EventSource('/mailbox/accounts/YOUR_ACCOUNT_ID/stream');
 *       es.onmessage = ev => console.log(JSON.parse(ev.data));
 *       ```
 *       
 *       **Event Types:**
 *       - `SSEReady`: Connection established
 *       - `WatcherReady`: Email watcher is ready
 *       - `EmailReceived`: New email received
 *       - `Error`: Error occurred
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account ID
 *         example: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
      *     responses:
     *       200:
 *         description: SSE stream established
 *         content:
 *           text/event-stream:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/MailboxSSEEvent'
 *                 - $ref: '#/components/schemas/MailboxEmailReceivedEvent'
 *             examples:
 *               SSEReady:
 *                 summary: Stream connection ready
 *                 value: |
 *                   data: {"type":"SSEReady","accountId":"01ARZ3NDEKTSV4RRFFQ69G5FAV"}
 *               EmailReceived:
 *                 summary: New email received
 *                 value: |
 *                   data: {"type":"EmailReceived","accountId":"01ARZ3NDEKTSV4RRFFQ69G5FAV","uid":12345,"subject":"New Message","from":["sender@example.com"],"to":["user@example.com"],"date":"2024-01-01T12:00:00.000Z","flags":["\\\\Recent"]}
 *       400:
 *         description: Bad request or account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
mailboxRouter.get("/accounts/:id/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const accountId = req.params.id;

  try {
    await ensureWatcher(accountId);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: "Error", message: e?.message || "Watcher failed" })}\n\n`);
  }

  const w = watchers.get(accountId);
  if (!w) {
    res.write(`data: ${JSON.stringify({ type: "Error", message: "Watcher unavailable" })}\n\n`);
  } else {
    w.sseClients.add(res);
  }

  res.write(`data: ${JSON.stringify({ type: "SSEReady", accountId })}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(`event: ping\ndata: {}\n\n`);
    } catch {}
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    if (w) {
      w.sseClients.delete(res);
      keepAliveWatcher(w); // قد يوقف بعد دقيقة إذا ما بقي مستمعين
    }
    try {
      res.end();
    } catch {}
  });
});

module.exports = mailboxRouter;
