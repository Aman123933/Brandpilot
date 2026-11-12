// Dependency-free mock server for BrandPilot frontend development
// Implements every endpoint from ROUND3_CONTRACT.md with realistic stateful fixtures.
// Port: 8000 (default)

import http from 'node:http'
import { URL } from 'node:url'

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000

// Initial Seed Data Fixtures
function createInitialState() {
  const users = [
    {
      id: 1,
      org_id: 1,
      name: 'Maya Lin',
      email: 'maya@kestrelaudio.com',
      role: 'brand_manager',
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 2,
      org_id: 1,
      name: 'Dev Patel',
      email: 'dev@kestrelaudio.com',
      role: 'creator',
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 3,
      org_id: 1,
      name: 'Sana Miller',
      email: 'sana@kestrelaudio.com',
      role: 'reviewer',
      created_at: '2026-10-01T10:00:00Z',
    },
  ]

  const demoCredentials = [
    {
      name: 'Maya Lin',
      email: 'maya@kestrelaudio.com',
      password: 'Demo@2026',
      role: 'brand_manager',
      description: 'Owns facts, guidelines and Brand Git',
    },
    {
      name: 'Dev Patel',
      email: 'dev@kestrelaudio.com',
      password: 'Demo@2026',
      role: 'creator',
      description: 'Drafts copy, runs audits and submits for review',
    },
    {
      name: 'Sana Miller',
      email: 'sana@kestrelaudio.com',
      password: 'Demo@2026',
      role: 'reviewer',
      description: 'Reviews assets, issues and revokes passports',
    },
  ]

  const facts = [
    {
      id: 1,
      org_id: 1,
      key: 'price_usd',
      owner_id: 1,
      current_version: {
        id: 101,
        fact_id: 1,
        version: 1,
        value: '129',
        unit: 'USD',
        valid_from: '2026-10-01T00:00:00Z',
        valid_until: '2027-10-01T00:00:00Z',
        is_current: true,
        source_note: 'Approved Q4 2026 MSRP pricing deck',
        created_by: 1,
      },
      versions: [
        {
          id: 101,
          fact_id: 1,
          version: 1,
          value: '129',
          unit: 'USD',
          valid_from: '2026-10-01T00:00:00Z',
          valid_until: '2027-10-01T00:00:00Z',
          is_current: true,
          source_note: 'Approved Q4 2026 MSRP pricing deck',
          created_by: 1,
        },
      ],
    },
    {
      id: 2,
      org_id: 1,
      key: 'battery_life_hours',
      owner_id: 1,
      current_version: {
        id: 102,
        fact_id: 2,
        version: 1,
        value: '24',
        unit: 'hours',
        valid_from: '2026-10-01T00:00:00Z',
        valid_until: '2027-10-01T00:00:00Z',
        is_current: true,
        source_note: 'Acoustic Lab Lab-502 Verification Report',
        created_by: 1,
      },
      versions: [
        {
          id: 102,
          fact_id: 2,
          version: 1,
          value: '24',
          unit: 'hours',
          valid_from: '2026-10-01T00:00:00Z',
          valid_until: '2027-10-01T00:00:00Z',
          is_current: true,
          source_note: 'Acoustic Lab Lab-502 Verification Report',
          created_by: 1,
        },
      ],
    },
    {
      id: 3,
      org_id: 1,
      key: 'anc_noise_reduction',
      owner_id: 1,
      current_version: {
        id: 103,
        fact_id: 3,
        version: 1,
        value: 'up to 32',
        unit: 'dB',
        valid_from: '2026-10-01T00:00:00Z',
        valid_until: '2027-10-01T00:00:00Z',
        is_current: true,
        source_note: 'ANC benchmark test run vs noise floor',
        created_by: 1,
      },
      versions: [
        {
          id: 103,
          fact_id: 3,
          version: 1,
          value: 'up to 32',
          unit: 'dB',
          valid_from: '2026-10-01T00:00:00Z',
          valid_until: '2027-10-01T00:00:00Z',
          is_current: true,
          source_note: 'ANC benchmark test run vs noise floor',
          created_by: 1,
        },
      ],
    },
    {
      id: 4,
      org_id: 1,
      key: 'return_window_days',
      owner_id: 1,
      current_version: {
        id: 104,
        fact_id: 4,
        version: 1,
        value: '30',
        unit: 'days',
        valid_from: '2026-10-01T00:00:00Z',
        valid_until: new Date(Date.now() + 3 * 86400000).toISOString(), // expires in 3 days
        is_current: true,
        source_note: 'Standard customer return policy v1',
        created_by: 1,
      },
      versions: [
        {
          id: 104,
          fact_id: 4,
          version: 1,
          value: '30',
          unit: 'days',
          valid_from: '2026-10-01T00:00:00Z',
          valid_until: new Date(Date.now() + 3 * 86400000).toISOString(),
          is_current: true,
          source_note: 'Standard customer return policy v1',
          created_by: 1,
        },
      ],
    },
    {
      id: 5,
      org_id: 1,
      key: 'warranty_months',
      owner_id: 1,
      current_version: {
        id: 105,
        fact_id: 5,
        version: 1,
        value: '12',
        unit: 'months',
        valid_from: '2026-10-01T00:00:00Z',
        valid_until: '2027-10-01T00:00:00Z',
        is_current: true,
        source_note: 'Limited Hardware Warranty Agreement',
        created_by: 1,
      },
      versions: [
        {
          id: 105,
          fact_id: 5,
          version: 1,
          value: '12',
          unit: 'months',
          valid_from: '2026-10-01T00:00:00Z',
          valid_until: '2027-10-01T00:00:00Z',
          is_current: true,
          source_note: 'Limited Hardware Warranty Agreement',
          created_by: 1,
        },
      ],
    },
  ]

  const guidelines = [
    {
      id: 1,
      org_id: 1,
      title: 'Kestrel Voice & Claims',
      owner_id: 1,
      active_version: 1,
      versions: [
        {
          id: 1,
          guideline_id: 1,
          version: 1,
          status: 'active',
          is_active: true,
          body: 'Approved voice guidelines and substantiation rules for Kestrel Audio marketing materials.',
          change_note: 'Initial approved release v1.0',
          created_at: '2026-10-01T10:00:00Z',
          created_by: { id: 1, name: 'Maya Lin' },
          rules_summary: {
            banned_terms: 3,
            required_phrases: 1,
            claim_rules: 2,
          },
          rules: {
            banned_terms: [
              {
                id: 'BT-001',
                term: 'cheap',
                preferred: 'accessible / affordable',
                why: 'Kestrel products are crafted with premium materials at accessible pricing, not cut-rate.',
                owner_id: 1,
              },
              {
                id: 'BT-002',
                term: 'best in the world',
                preferred: 'industry-leading clarity',
                why: 'Absolute superlatives attract regulatory scrutiny without documented third-party testing.',
                owner_id: 1,
              },
              {
                id: 'BT-003',
                term: 'guaranteed',
                preferred: 'backed by warranty',
                why: 'Legal requires referencing specific warranty terms rather than unconditional promises.',
                owner_id: 1,
              },
            ],
            required_phrases: [
              {
                id: 'RP-001',
                phrase: 'Kestrel Audio',
                why: 'Ensure proper trademark capitalization on first brand mention.',
                owner_id: 1,
              },
            ],
            claim_rules: [
              {
                id: 'CR-001',
                pattern: '% better',
                requires_fact_key: 'anc_noise_reduction',
                why: 'Numerical superiority claims must link directly to lab benchmark facts.',
                owner_id: 1,
              },
              {
                id: 'CR-002',
                pattern: '#1',
                requires_fact_key: null,
                why: 'Rank claims require external research citation in source notes.',
                owner_id: 1,
              },
            ],
            tone_notes: [
              'Confident, restrained, and plain-spoken.',
              'Avoid hype, hyperbole, and breathless superlatives.',
              'Technical specifications should speak for themselves.',
            ],
          },
          latest_replay: null,
        },
      ],
    },
  ]

  const assets = [
    {
      id: 1,
      org_id: 1,
      title: 'Kestrel One Launch Announcement',
      creator_id: 2,
      status: 'approved',
      current_revision: 2,
      body: 'Introducing the Kestrel One wireless headphones by Kestrel Audio. Offering 24 hours of verified listening on a single charge and up to 32 dB active noise reduction. Covered by a 12 months limited warranty and a 30 days return window. Available worldwide at $129 USD.',
      revisions: [
        {
          revision: 1,
          body: 'The all-new Kestrel One headphones offer 24 hours battery and 32 dB noise cancellation for $129 USD.',
          created_at: '2026-10-15T11:00:00Z',
        },
        {
          revision: 2,
          body: 'Introducing the Kestrel One wireless headphones by Kestrel Audio. Offering 24 hours of verified listening on a single charge and up to 32 dB active noise reduction. Covered by a 12 months limited warranty and a 30 days return window. Available worldwide at $129 USD.',
          created_at: '2026-10-15T14:30:00Z',
        },
      ],
      passport_code: 'BP-2026-9041',
      created_at: '2026-10-15T11:00:00Z',
    },
    {
      id: 2,
      org_id: 1,
      title: 'Holiday Campaign Draft - Social Ad',
      creator_id: 2,
      status: 'draft',
      current_revision: 1,
      body: 'Get the best headphones in the world! Kestrel One is cheap, delivers 30 hours of battery life, and comes with an unconditional guaranteed 2-year warranty.',
      revisions: [
        {
          revision: 1,
          body: 'Get the best headphones in the world! Kestrel One is cheap, delivers 30 hours of battery life, and comes with an unconditional guaranteed 2-year warranty.',
          created_at: '2026-11-01T09:00:00Z',
        },
      ],
      passport_code: null,
      created_at: '2026-11-01T09:00:00Z',
    },
  ]

  const findings = [
    {
      id: 1,
      asset_id: 2,
      revision: 1,
      kind: 'rule_violation',
      severity: 'high',
      quote: 'best in the world',
      start_offset: 8,
      end_offset: 26,
      explanation: 'Superlative banned by Brand Voice rule BT-002.',
      suggestion: 'industry-leading clarity',
      source_type: 'guideline',
      source_ref: 1,
      rule_id: 'BT-002',
      status: 'open',
      origin: 'rules',
    },
    {
      id: 2,
      asset_id: 2,
      revision: 1,
      kind: 'rule_violation',
      severity: 'high',
      quote: 'cheap',
      start_offset: 44,
      end_offset: 49,
      explanation: 'Banned term cheap violates rule BT-001.',
      suggestion: 'accessible',
      source_type: 'guideline',
      source_ref: 1,
      rule_id: 'BT-001',
      status: 'open',
      origin: 'rules',
    },
    {
      id: 3,
      asset_id: 2,
      revision: 1,
      kind: 'fact_mismatch',
      severity: 'high',
      quote: '30 hours',
      start_offset: 60,
      end_offset: 68,
      explanation: 'Battery life rating mismatch: approved fact battery_life_hours is 24 hours.',
      suggestion: '24 hours',
      source_type: 'fact',
      source_ref: 2,
      rule_id: null,
      status: 'open',
      origin: 'rules',
    },
    {
      id: 4,
      asset_id: 2,
      revision: 1,
      kind: 'rule_violation',
      severity: 'medium',
      quote: 'guaranteed',
      start_offset: 122,
      end_offset: 132,
      explanation: 'Unqualified guarantee term violates rule BT-003.',
      suggestion: 'backed by warranty',
      source_type: 'guideline',
      source_ref: 1,
      rule_id: 'BT-003',
      status: 'open',
      origin: 'rules',
    },
  ]

  const passports = [
    {
      id: 1,
      code: 'BP-2026-9041',
      asset_id: 1,
      status: 'valid',
      approved_by: 3,
      approved_by_name: 'Sana Miller',
      approved_at: '2026-10-15T15:00:00Z',
      ai_disclosure: 'Automated pre-flight validation with human reviewer sign-off.',
      created_at: '2026-10-15T15:00:00Z',
      withdrawn_reason: null,
      withdrawn_at: null,
      withdrawn_by: null,
      linked_facts: [
        { fact_id: 1, key: 'price_usd', value: '129', unit: 'USD', version: 1 },
        { fact_id: 2, key: 'battery_life_hours', value: '24', unit: 'hours', version: 1 },
        { fact_id: 3, key: 'anc_noise_reduction', value: 'up to 32', unit: 'dB', version: 1 },
        { fact_id: 4, key: 'return_window_days', value: '30', unit: 'days', version: 1 },
        { fact_id: 5, key: 'warranty_months', value: '12', unit: 'months', version: 1 },
      ],
      approvals: [
        {
          reviewer_id: 3,
          reviewer_name: 'Sana Miller',
          decision: 'approved',
          comment: 'All claims substantiated against lab specs. Passed Brand Voice v1.',
          decided_at: '2026-10-15T15:00:00Z',
        },
      ],
    },
  ]

  const notifications = [
    {
      id: 1,
      user_id: 1,
      message: 'Passport BP-2026-9041 was issued for Kestrel One Launch Announcement.',
      asset_id: 1,
      read: false,
      created_at: '2026-10-15T15:00:00Z',
    },
    {
      id: 2,
      user_id: 2,
      message: 'Your asset Kestrel One Launch Announcement was approved by Sana Miller.',
      asset_id: 1,
      read: true,
      created_at: '2026-10-15T15:00:00Z',
    },
  ]

  const replays = {}
  const failedLogins = {} // email -> array of timestamps

  return {
    users,
    demoCredentials,
    facts,
    guidelines,
    assets,
    findings,
    passports,
    notifications,
    replays,
    failedLogins,
    nextFactId: 6,
    nextFactVersionId: 106,
    nextGuidelineVersionId: 2,
    nextAssetId: 3,
    nextFindingId: 5,
    nextNotificationId: 3,
    expiryStatus: {
      last_run_at: '2026-11-12T12:00:00Z',
      last_run_source: 'startup',
      last_result: { affected_assets_count: 0 },
      next_run_at: new Date(Date.now() + 3600000).toISOString(),
      interval_minutes: 60,
    },
  }
}

let db = createInitialState()

// Helper: parse JSON body
function parseBody(req) {
  return new Promise(resolve => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve({ __raw: body })
      }
    })
  })
}

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret, x-simulate-ai-down',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  })
  res.end(JSON.stringify(data))
}

// Helper: get current authenticated user from Bearer token
function getAuthUser(req) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.slice(7).trim()
  if (token === 'expired-token') return 'EXPIRED'
  const match = token.match(/mock-token-(\d+)/)
  if (match) {
    const id = parseInt(match[1], 10)
    return db.users.find(u => u.id === id) || null
  }
  // Default to Maya (id: 1) if generic token provided
  return db.users[0]
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8000'}`)
  const pathname = parsedUrl.pathname
  const method = req.method

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret, x-simulate-ai-down',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    })
    return res.end()
  }

  // Check query / header for simulated network delay or AI toggle
  const simulateAiDown = req.headers['x-simulate-ai-down'] === '1' || parsedUrl.searchParams.get('ai_available') === 'false'

  // Public / Health Endpoints
  if (pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      version: '1.0.0',
      database: 'connected',
      database_engine: 'sqlite',
      ai: { configured: !simulateAiDown, model: 'gemini-3.8-flash' },
      timestamp: new Date().toISOString(),
    })
  }

  if (pathname === '/auth/demo-credentials' && method === 'GET') {
    return sendJson(res, 200, db.demoCredentials)
  }

  if (pathname === '/auth/demo-users' && method === 'GET') {
    return sendJson(res, 200, db.users)
  }

  if (pathname === '/auth/login' && method === 'POST') {
    const body = await parseBody(req)
    const email = (body.email || '').trim().toLowerCase()
    const password = body.password || ''

    // Rate limiting: 5 failed attempts within 10 min
    const now = Date.now()
    const attempts = (db.failedLogins[email] || []).filter(ts => now - ts < 600000)
    if (attempts.length >= 5) {
      return sendJson(res, 429, { detail: 'Too many attempts. Try again in a few minutes.' })
    }

    const cred = db.demoCredentials.find(c => c.email.toLowerCase() === email)
    if (!cred || cred.password !== password) {
      db.failedLogins[email] = [...attempts, now]
      return sendJson(res, 401, { detail: 'Invalid email or password' })
    }

    // Success
    delete db.failedLogins[email]
    const user = db.users.find(u => u.email.toLowerCase() === email)
    return sendJson(res, 200, {
      access_token: `mock-token-${user.id}`,
      token_type: 'bearer',
      user,
    })
  }

  if (pathname === '/auth/demo-login' && method === 'POST') {
    const body = await parseBody(req)
    const user = db.users.find(u => u.id === Number(body.user_id)) || db.users[0]
    return sendJson(res, 200, {
      access_token: `mock-token-${user.id}`,
      token_type: 'bearer',
      user,
    })
  }

  // Public Passport Verification
  const publicPassportMatch = pathname.match(/^\/passports\/([^/]+)\/public$/)
  if (publicPassportMatch && method === 'GET') {
    const code = publicPassportMatch[1]
    const passport = db.passports.find(p => p.code.toLowerCase() === code.toLowerCase())
    if (!passport) {
      return sendJson(res, 404, { detail: `Passport with code ${code} not found` })
    }
    const asset = db.assets.find(a => a.id === passport.asset_id)
    return sendJson(res, 200, {
      code: passport.code,
      asset_title: asset ? asset.title : 'Asset',
      status: passport.status,
      approved_at: passport.approved_at,
      reviewer_name: passport.approved_by_name || 'Sana Miller',
      guideline_version: 1,
      linked_fact_count: passport.linked_facts ? passport.linked_facts.length : 0,
      ai_disclosure: passport.ai_disclosure,
    })
  }

  const qrMatch = pathname.match(/^\/passports\/([^/]+)\/qr\.png$/)
  if (qrMatch && method === 'GET') {
    // Return minimal 1x1 valid PNG buffer
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    )
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': png1x1.length,
      'Access-Control-Allow-Origin': '*',
    })
    return res.end(png1x1)
  }

  // --- Authenticated routes below ---
  const authUser = getAuthUser(req)
  if (authUser === 'EXPIRED') {
    return sendJson(res, 401, { detail: 'Your session expired. Please sign in again.' })
  }
  if (!authUser) {
    return sendJson(res, 401, { detail: 'Not authenticated' })
  }

  if (pathname === '/auth/me' && method === 'GET') {
    return sendJson(res, 200, authUser)
  }

  // --- Facts ---
  if (pathname === '/facts' && method === 'GET') {
    return sendJson(res, 200, db.facts)
  }

  if (pathname === '/facts' && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can create facts' })
    }
    const body = await parseBody(req)
    if (!body.key || !body.value) {
      return sendJson(res, 400, { detail: 'Key and value are required' })
    }
    const newFact = {
      id: db.nextFactId++,
      org_id: authUser.org_id,
      key: body.key.trim(),
      owner_id: authUser.id,
      current_version: {
        id: db.nextFactVersionId++,
        fact_id: db.nextFactId - 1,
        version: 1,
        value: body.value,
        unit: body.unit || '',
        valid_from: new Date().toISOString(),
        valid_until: body.valid_until || null,
        is_current: true,
        source_note: body.source_note || '',
        created_by: authUser.id,
      },
      versions: [],
    }
    newFact.versions.push(newFact.current_version)
    db.facts.push(newFact)
    return sendJson(res, 201, newFact)
  }

  const factImpactMatch = pathname.match(/^\/facts\/(\d+)\/impact$/)
  if (factImpactMatch && method === 'GET') {
    const factId = parseInt(factImpactMatch[1], 10)
    const fact = db.facts.find(f => f.id === factId)
    if (!fact) return sendJson(res, 404, { detail: 'Fact not found' })

    const affected = db.passports
      .filter(p => p.status === 'valid' && p.linked_facts?.some(lf => lf.fact_id === factId))
      .map(p => {
        const a = db.assets.find(as => as.id === p.asset_id)
        return {
          asset_id: p.asset_id,
          title: a?.title || 'Approved asset',
          passport_code: p.code,
        }
      })

    return sendJson(res, 200, {
      fact_id: fact.id,
      key: fact.key,
      affected_assets: affected,
    })
  }

  const factVersionsMatch = pathname.match(/^\/facts\/(\d+)\/versions$/)
  if (factVersionsMatch && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can update facts' })
    }
    const factId = parseInt(factVersionsMatch[1], 10)
    const fact = db.facts.find(f => f.id === factId)
    if (!fact) return sendJson(res, 404, { detail: 'Fact not found' })

    const body = await parseBody(req)
    if (!body.value) return sendJson(res, 400, { detail: 'Value is required' })

    const nextVer = fact.versions.length + 1
    const newVersion = {
      id: db.nextFactVersionId++,
      fact_id: fact.id,
      version: nextVer,
      value: body.value,
      unit: body.unit !== undefined ? body.unit : fact.current_version.unit,
      valid_from: new Date().toISOString(),
      valid_until: body.valid_until || null,
      is_current: true,
      source_note: body.source_note || '',
      created_by: authUser.id,
    }

    fact.versions.forEach(v => {
      v.is_current = false
    })
    fact.versions.push(newVersion)
    fact.current_version = newVersion

    // Recall affected passports -> set status to review_required and notify owners
    db.passports.forEach(p => {
      if (p.linked_facts?.some(lf => lf.fact_id === fact.id) && p.status === 'valid') {
        p.status = 'review_required'
        const a = db.assets.find(ast => ast.id === p.asset_id)
        if (a) {
          a.status = 'review_required'
          db.notifications.push({
            id: db.nextNotificationId++,
            user_id: a.creator_id,
            message: `Fact '${fact.key}' updated to v${nextVer}. Passport ${p.code} set to Review Required.`,
            asset_id: a.id,
            read: false,
            created_at: new Date().toISOString(),
          })
        }
      }
    })

    return sendJson(res, 201, fact)
  }

  const factDetailMatch = pathname.match(/^\/facts\/(\d+)$/)
  if (factDetailMatch && method === 'GET') {
    const factId = parseInt(factDetailMatch[1], 10)
    const fact = db.facts.find(f => f.id === factId)
    if (!fact) return sendJson(res, 404, { detail: 'Fact not found' })
    return sendJson(res, 200, fact)
  }

  // --- Guidelines & Brand Git ---
  if (pathname === '/guidelines' && method === 'GET') {
    return sendJson(res, 200, db.guidelines)
  }

  if (pathname === '/guidelines' && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can create guidelines' })
    }
    const body = await parseBody(req)
    const newG = {
      id: db.guidelines.length + 1,
      org_id: authUser.org_id,
      title: body.title || 'Brand Guidelines',
      owner_id: authUser.id,
      active_version: 1,
      versions: [
        {
          id: db.nextGuidelineVersionId++,
          guideline_id: db.guidelines.length + 1,
          version: 1,
          status: 'active',
          is_active: true,
          body: body.body || '',
          change_note: 'Initial release',
          created_at: new Date().toISOString(),
          created_by: { id: authUser.id, name: authUser.name },
          rules_summary: {
            banned_terms: body.rules?.banned_terms?.length || 0,
            required_phrases: body.rules?.required_phrases?.length || 0,
            claim_rules: body.rules?.claim_rules?.length || 0,
          },
          rules: body.rules || { banned_terms: [], required_phrases: [], claim_rules: [], tone_notes: [] },
          latest_replay: null,
        },
      ],
    }
    db.guidelines.push(newG)
    return sendJson(res, 201, newG)
  }

  // Guideline Versions List
  const guidelineVersionsMatch = pathname.match(/^\/guidelines\/(\d+)\/versions$/)
  if (guidelineVersionsMatch && method === 'GET') {
    const gId = parseInt(guidelineVersionsMatch[1], 10)
    const g = db.guidelines.find(item => item.id === gId)
    if (!g) return sendJson(res, 404, { detail: 'Guideline not found' })
    const list = [...g.versions]
      .reverse()
      .map(v => ({
        id: v.id,
        version: v.version,
        status: v.status,
        created_at: v.created_at,
        created_by: v.created_by,
        change_note: v.change_note,
        rules_summary: v.rules_summary,
        latest_replay: v.latest_replay,
      }))
    return sendJson(res, 200, list)
  }

  // Create Guideline Version (Draft by default)
  if (guidelineVersionsMatch && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can create guideline versions' })
    }
    const gId = parseInt(guidelineVersionsMatch[1], 10)
    const g = db.guidelines.find(item => item.id === gId)
    if (!g) return sendJson(res, 404, { detail: 'Guideline not found' })

    const body = await parseBody(req)
    const nextVer = g.versions.length + 1
    const isAct = body.activate === true
    const newV = {
      id: db.nextGuidelineVersionId++,
      guideline_id: g.id,
      version: nextVer,
      status: isAct ? 'active' : 'draft',
      is_active: isAct,
      body: body.body || g.versions[g.versions.length - 1].body,
      change_note: body.change_note || null,
      created_at: new Date().toISOString(),
      created_by: { id: authUser.id, name: authUser.name },
      rules_summary: {
        banned_terms: body.rules?.banned_terms?.length || 0,
        required_phrases: body.rules?.required_phrases?.length || 0,
        claim_rules: body.rules?.claim_rules?.length || 0,
      },
      rules: body.rules || JSON.parse(JSON.stringify(g.versions[g.versions.length - 1].rules)),
      latest_replay: null,
    }

    if (isAct) {
      g.versions.forEach(v => {
        v.status = 'archived'
        v.is_active = false
      })
      g.active_version = nextVer
    }

    g.versions.push(newV)
    return sendJson(res, 201, newV)
  }

  // Guideline Diff
  const guidelineDiffMatch = pathname.match(/^\/guidelines\/(\d+)\/diff$/)
  if (guidelineDiffMatch && method === 'GET') {
    const gId = parseInt(guidelineDiffMatch[1], 10)
    const g = db.guidelines.find(item => item.id === gId)
    if (!g) return sendJson(res, 404, { detail: 'Guideline not found' })

    const fromVNum = parseInt(parsedUrl.searchParams.get('from'), 10)
    const toVNum = parseInt(parsedUrl.searchParams.get('to'), 10)

    if (fromVNum === toVNum) {
      return sendJson(res, 400, { detail: 'from and to versions must be different' })
    }

    const fromV = g.versions.find(v => v.version === fromVNum)
    const toV = g.versions.find(v => v.version === toVNum)
    if (!fromV || !toV) {
      return sendJson(res, 404, { detail: 'One or both guideline versions do not exist' })
    }

    // Compute diff
    const changes = []
    // Compare banned_terms
    const fromBT = fromV.rules?.banned_terms || []
    const toBT = toV.rules?.banned_terms || []
    toBT.forEach(r => {
      const old = fromBT.find(f => f.id === r.id)
      if (!old) {
        changes.push({ kind: 'added', section: 'banned_terms', rule_id: r.id, before: null, after: r })
      } else if (JSON.stringify(old) !== JSON.stringify(r)) {
        changes.push({ kind: 'changed', section: 'banned_terms', rule_id: r.id, before: old, after: r })
      }
    })
    fromBT.forEach(r => {
      if (!toBT.find(t => t.id === r.id)) {
        changes.push({ kind: 'removed', section: 'banned_terms', rule_id: r.id, before: r, after: null })
      }
    })

    // Compare tone_notes
    const fromTone = fromV.rules?.tone_notes || []
    const toTone = toV.rules?.tone_notes || []
    toTone.forEach((t, i) => {
      if (fromTone[i] !== t) {
        changes.push({ kind: fromTone[i] ? 'changed' : 'added', section: 'tone_notes', rule_id: null, before: fromTone[i] || null, after: t })
      }
    })

    const summary = {
      added: changes.filter(c => c.kind === 'added').length,
      removed: changes.filter(c => c.kind === 'removed').length,
      changed: changes.filter(c => c.kind === 'changed').length,
    }

    return sendJson(res, 200, {
      guideline_id: g.id,
      from_version: fromVNum,
      to_version: toVNum,
      summary,
      changes,
    })
  }

  // Guideline Replay
  const replayMatch = pathname.match(/^\/guidelines\/(\d+)\/versions\/(\d+)\/replay$/)
  if (replayMatch && (method === 'POST' || method === 'GET')) {
    const gId = parseInt(replayMatch[1], 10)
    const vNum = parseInt(replayMatch[2], 10)
    const g = db.guidelines.find(item => item.id === gId)
    if (!g) return sendJson(res, 404, { detail: 'Guideline not found' })

    const version = g.versions.find(v => v.version === vNum)
    if (!version) return sendJson(res, 404, { detail: 'Version not found' })

    const replayKey = `${gId}_${vNum}`

    if (method === 'GET') {
      const stored = db.replays[replayKey]
      if (!stored) {
        return sendJson(res, 404, { detail: 'No replay has been run for this version yet' })
      }
      return sendJson(res, 200, stored)
    }

    if (method === 'POST') {
      if (version.status !== 'draft') {
        return sendJson(res, 409, { detail: 'Replay can only be run on draft versions' })
      }

      const replayResult = {
        guideline_id: g.id,
        active_version: g.active_version,
        proposed_version: vNum,
        scope: 'approved',
        ran_at: new Date().toISOString(),
        assets_checked: db.assets.length,
        summary: {
          assets_newly_noncompliant: 1,
          assets_newly_compliant: 0,
          violations_added: 1,
          violations_cleared: 0,
          unchanged_violations: 1,
        },
        newly_flagged: [
          {
            asset_id: 1,
            title: db.assets[0]?.title || 'Kestrel One Launch Announcement',
            status: 'approved',
            passport_code: 'BP-2026-9041',
            rule_id: 'BT-004',
            quote: 'wireless',
            severity: 'high',
          },
        ],
        newly_cleared: [],
      }

      db.replays[replayKey] = replayResult
      version.latest_replay = {
        ran_at: replayResult.ran_at,
        assets_newly_noncompliant: replayResult.summary.assets_newly_noncompliant,
        assets_newly_compliant: replayResult.summary.assets_newly_compliant,
      }

      return sendJson(res, 200, replayResult)
    }
  }

  // Guideline Activate
  const activateMatch = pathname.match(/^\/guidelines\/(\d+)\/versions\/(\d+)\/activate$/)
  if (activateMatch && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can activate versions' })
    }
    const gId = parseInt(activateMatch[1], 10)
    const vNum = parseInt(activateMatch[2], 10)
    const g = db.guidelines.find(item => item.id === gId)
    if (!g) return sendJson(res, 404, { detail: 'Guideline not found' })

    const version = g.versions.find(v => v.version === vNum)
    if (!version) return sendJson(res, 404, { detail: 'Version not found' })

    if (version.status !== 'draft') {
      return sendJson(res, 409, { detail: 'Only draft versions can be activated' })
    }

    const replayKey = `${gId}_${vNum}`
    if (!db.replays[replayKey]) {
      return sendJson(res, 409, { detail: 'Run a replay before activating this version' })
    }

    const prevVersion = g.active_version
    g.versions.forEach(v => {
      if (v.status === 'active') {
        v.status = 'archived'
        v.is_active = false
      }
    })

    version.status = 'active'
    version.is_active = true
    g.active_version = vNum

    // Notify reviewers and owner
    db.notifications.push({
      id: db.nextNotificationId++,
      user_id: 3, // Sana
      message: `Guideline '${g.title}' v${vNum} was activated by ${authUser.name}.`,
      asset_id: null,
      read: false,
      created_at: new Date().toISOString(),
    })

    return sendJson(res, 200, {
      guideline_id: g.id,
      version: vNum,
      status: 'active',
      previous_version: prevVersion,
      assets_to_recheck: 1,
    })
  }

  // Guideline Reject
  const rejectMatch = pathname.match(/^\/guidelines\/(\d+)\/versions\/(\d+)\/reject$/)
  if (rejectMatch && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can reject versions' })
    }
    const gId = parseInt(rejectMatch[1], 10)
    const vNum = parseInt(rejectMatch[2], 10)
    const g = db.guidelines.find(item => item.id === gId)
    if (!g) return sendJson(res, 404, { detail: 'Guideline not found' })

    const version = g.versions.find(v => v.version === vNum)
    if (!version) return sendJson(res, 404, { detail: 'Version not found' })

    const body = await parseBody(req)
    if (!body.note || body.note.trim().length < 3) {
      return sendJson(res, 400, { detail: 'Rejection note is required (minimum 3 characters)' })
    }

    version.status = 'rejected'
    version.is_active = false
    return sendJson(res, 200, { version: vNum, status: 'rejected' })
  }

  // Guideline Detail
  const guidelineDetailMatch = pathname.match(/^\/guidelines\/(\d+)$/)
  if (guidelineDetailMatch && method === 'GET') {
    const gId = parseInt(guidelineDetailMatch[1], 10)
    const g = db.guidelines.find(item => item.id === gId)
    if (!g) return sendJson(res, 404, { detail: 'Guideline not found' })
    return sendJson(res, 200, g)
  }

  // --- Assets ---
  if (pathname === '/assets' && method === 'GET') {
    return sendJson(res, 200, db.assets)
  }

  if (pathname === '/assets' && method === 'POST') {
    const body = await parseBody(req)
    if (!body.title || !body.body) {
      return sendJson(res, 400, { detail: 'Title and body text are required' })
    }
    const newAsset = {
      id: db.nextAssetId++,
      org_id: authUser.org_id,
      title: body.title.trim(),
      creator_id: authUser.id,
      status: 'draft',
      current_revision: 1,
      body: body.body.trim(),
      revisions: [
        {
          revision: 1,
          body: body.body.trim(),
          created_at: new Date().toISOString(),
        },
      ],
      passport_code: null,
      created_at: new Date().toISOString(),
    }
    db.assets.push(newAsset)
    return sendJson(res, 201, newAsset)
  }

  if (pathname === '/assets/upload' && method === 'POST') {
    const body = await parseBody(req)
    const title = body.title || 'Uploaded Document'
    const text = body.text || body.__raw || 'Extracted document content.'
    const newAsset = {
      id: db.nextAssetId++,
      org_id: authUser.org_id,
      title: title.trim(),
      creator_id: authUser.id,
      status: 'draft',
      current_revision: 1,
      body: text.trim(),
      revisions: [
        {
          revision: 1,
          body: text.trim(),
          created_at: new Date().toISOString(),
        },
      ],
      passport_code: null,
      created_at: new Date().toISOString(),
    }
    db.assets.push(newAsset)
    return sendJson(res, 201, newAsset)
  }

  // Asset Audit
  const auditMatch = pathname.match(/^\/assets\/(\d+)\/audit$/)
  if (auditMatch && method === 'POST') {
    const assetId = parseInt(auditMatch[1], 10)
    const asset = db.assets.find(a => a.id === assetId)
    if (!asset) return sendJson(res, 404, { detail: 'Asset not found' })

    let assetFindings = db.findings.filter(f => f.asset_id === assetId)
    if (assetFindings.length === 0) {
      const bodyLower = (asset.body || '').toLowerCase()
      if (bodyLower.includes('cheap')) {
        const f = {
          id: db.nextFindingId++,
          asset_id: assetId,
          revision: asset.current_revision,
          kind: 'rule_violation',
          severity: 'high',
          quote: 'cheap',
          explanation: "Banned term 'cheap' violates brand voice rule BT-001.",
          suggestion: 'accessible',
          source_type: 'guideline',
          rule_id: 'BT-001',
          status: 'open',
          origin: 'rules',
          created_at: new Date().toISOString(),
        }
        db.findings.push(f)
        assetFindings.push(f)
      }
      if (bodyLower.includes('best')) {
        const f = {
          id: db.nextFindingId++,
          asset_id: assetId,
          revision: asset.current_revision,
          kind: 'rule_violation',
          severity: 'high',
          quote: 'best',
          explanation: "Unsubstantiated superlative 'best' requires verified benchmark.",
          suggestion: 'finely tuned',
          source_type: 'guideline',
          rule_id: 'CR-001',
          status: 'open',
          origin: 'rules',
          created_at: new Date().toISOString(),
        }
        db.findings.push(f)
        assetFindings.push(f)
      }
    }

    if (simulateAiDown) {
      return sendJson(res, 200, {
        asset_id: asset.id,
        revision: asset.current_revision,
        findings: assetFindings,
        ai_available: false,
        ai_message: 'AI daily limit reached. Rule-based checks completed.',
        summary: {
          high: assetFindings.filter(f => f.severity === 'high').length,
          medium: assetFindings.filter(f => f.severity === 'medium').length,
          low: assetFindings.filter(f => f.severity === 'low').length,
        },
      })
    }

    return sendJson(res, 200, {
      asset_id: asset.id,
      revision: asset.current_revision,
      findings: assetFindings,
      ai_available: true,
      ai_message: null,
      summary: {
        high: assetFindings.filter(f => f.severity === 'high').length,
        medium: assetFindings.filter(f => f.severity === 'medium').length,
        low: assetFindings.filter(f => f.severity === 'low').length,
      },
    })
  }

  // Asset Red Team
  const redteamMatch = pathname.match(/^\/assets\/(\d+)\/redteam$/)
  if (redteamMatch && method === 'POST') {
    const assetId = parseInt(redteamMatch[1], 10)
    const asset = db.assets.find(a => a.id === assetId)
    if (!asset) return sendJson(res, 404, { detail: 'Asset not found' })

    if (simulateAiDown) {
      return sendJson(res, 200, {
        asset_id: asset.id,
        revision: asset.current_revision,
        ai_available: false,
        ai_message: 'AI red-team simulation unavailable. Please retry later.',
        risks: [],
      })
    }

    const risks = [
      {
        persona: 'Critical Journalist',
        concern: 'Unsubstantiated absolute claim about battery performance and world ranking.',
        severity: 'high',
        quote: 'best headphones in the world',
        recommendation: 'Cite verified third-party acoustic lab benchmark.',
      },
      {
        persona: 'Competitor',
        concern: 'Challenging price characterization without comparative market matrix.',
        severity: 'medium',
        quote: 'cheap',
        recommendation: 'Position as high-value engineering rather than cheap.',
      },
      {
        persona: 'Skeptical Customer',
        concern: 'Warranty duration claims contradictory to standard terms.',
        severity: 'medium',
        quote: 'unconditional guaranteed 2-year warranty',
        recommendation: 'Link directly to official 12-month limited warranty agreement.',
      },
    ]

    return sendJson(res, 200, {
      asset_id: asset.id,
      revision: asset.current_revision,
      ai_available: true,
      ai_message: null,
      risks,
    })
  }

  // Asset Findings
  const findingsMatch = pathname.match(/^\/assets\/(\d+)\/findings$/)
  if (findingsMatch && method === 'GET') {
    const assetId = parseInt(findingsMatch[1], 10)
    const list = db.findings.filter(f => f.asset_id === assetId)
    return sendJson(res, 200, list)
  }

  // Patch Finding (Accept / Dismiss)
  const patchFindingMatch = pathname.match(/^\/findings\/(\d+)$/)
  if (patchFindingMatch && method === 'PATCH') {
    const fId = parseInt(patchFindingMatch[1], 10)
    const finding = db.findings.find(f => f.id === fId)
    if (!finding) return sendJson(res, 404, { detail: 'Finding not found' })

    const body = await parseBody(req)
    if (!['accepted', 'dismissed'].includes(body.status)) {
      return sendJson(res, 400, { detail: "Status must be 'accepted' or 'dismissed'" })
    }

    finding.status = body.status

    if (body.status === 'accepted' && finding.suggestion) {
      const asset = db.assets.find(a => a.id === finding.asset_id)
      if (asset) {
        asset.body = asset.body.replace(finding.quote, finding.suggestion)
        asset.current_revision++
        asset.revisions.push({
          revision: asset.current_revision,
          body: asset.body,
          created_at: new Date().toISOString(),
        })
      }
    }

    return sendJson(res, 200, finding)
  }

  // Submit Asset for Review
  const submitMatch = pathname.match(/^\/assets\/(\d+)\/submit$/)
  if (submitMatch && method === 'POST') {
    const assetId = parseInt(submitMatch[1], 10)
    const asset = db.assets.find(a => a.id === assetId)
    if (!asset) return sendJson(res, 404, { detail: 'Asset not found' })

    if (asset.status === 'in_review') {
      return sendJson(res, 409, { detail: 'Asset is already in review' })
    }

    asset.status = 'in_review'
    db.notifications.push({
      id: db.nextNotificationId++,
      user_id: 3, // Sana
      message: `Asset '${asset.title}' submitted for reviewer approval by ${authUser.name}.`,
      asset_id: asset.id,
      read: false,
      created_at: new Date().toISOString(),
    })

    return sendJson(res, 200, asset)
  }

  // Asset History
  const historyMatch = pathname.match(/^\/assets\/(\d+)\/history$/)
  if (historyMatch && method === 'GET') {
    const assetId = parseInt(historyMatch[1], 10)
    const asset = db.assets.find(a => a.id === assetId)
    if (!asset) return sendJson(res, 404, { detail: 'Asset not found' })

    const history = [
      {
        action: 'created',
        actor: 'Dev Patel',
        timestamp: asset.created_at,
        details: `Initial revision 1 draft created`,
      },
    ]

    return sendJson(res, 200, history)
  }

  // Asset Detail
  const assetDetailMatch = pathname.match(/^\/assets\/(\d+)$/)
  if (assetDetailMatch && method === 'GET') {
    const assetId = parseInt(assetDetailMatch[1], 10)
    const asset = db.assets.find(a => a.id === assetId)
    if (!asset) return sendJson(res, 404, { detail: 'Asset not found' })
    return sendJson(res, 200, asset)
  }

  // Review Queue
  if (pathname === '/reviews/queue' && method === 'GET') {
    if (authUser.role !== 'reviewer') {
      return sendJson(res, 403, { detail: 'Only reviewers can access the review queue' })
    }
    const queue = db.assets
      .filter(a => a.status === 'in_review')
      .map(a => ({
        id: a.id,
        title: a.title,
        creator_id: a.creator_id,
        creator_name: db.users.find(u => u.id === a.creator_id)?.name || 'Creator',
        status: a.status,
        current_revision: a.current_revision,
        open_high_findings: db.findings.filter(f => f.asset_id === a.id && f.status === 'open' && f.severity === 'high').length,
        open_total_findings: db.findings.filter(f => f.asset_id === a.id && f.status === 'open').length,
        submitted_at: a.created_at,
      }))
    return sendJson(res, 200, queue)
  }

  // Asset Decision
  const decisionMatch = pathname.match(/^\/assets\/(\d+)\/decision$/)
  if (decisionMatch && method === 'POST') {
    if (authUser.role !== 'reviewer') {
      return sendJson(res, 403, { detail: 'Only reviewers can record review decisions' })
    }
    const assetId = parseInt(decisionMatch[1], 10)
    const asset = db.assets.find(a => a.id === assetId)
    if (!asset) return sendJson(res, 404, { detail: 'Asset not found' })

    const body = await parseBody(req)
    const decision = body.decision
    if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
      return sendJson(res, 400, { detail: 'Invalid decision' })
    }

    if (['rejected', 'changes_requested'].includes(decision) && (!body.comment || body.comment.trim().length === 0)) {
      return sendJson(res, 400, { detail: 'A comment is required for rejection or requesting changes' })
    }

    asset.status = decision

    let passportCode = null
    if (decision === 'approved') {
      passportCode = `BP-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`
      asset.passport_code = passportCode

      db.passports.push({
        id: db.passports.length + 1,
        code: passportCode,
        asset_id: asset.id,
        status: 'valid',
        approved_by: authUser.id,
        approved_by_name: authUser.name,
        approved_at: new Date().toISOString(),
        ai_disclosure: 'Verified by deterministic rules and reviewer Sana Miller.',
        created_at: new Date().toISOString(),
        withdrawn_reason: null,
        withdrawn_at: null,
        withdrawn_by: null,
        linked_facts: db.facts.map(f => ({
          fact_id: f.id,
          key: f.key,
          value: f.current_version.value,
          unit: f.current_version.unit,
          version: f.current_version.version,
        })),
        approvals: [
          {
            reviewer_id: authUser.id,
            reviewer_name: authUser.name,
            decision: 'approved',
            comment: body.comment || 'Approved after pre-flight inspection.',
            decided_at: new Date().toISOString(),
          },
        ],
      })
    }

    db.notifications.push({
      id: db.nextNotificationId++,
      user_id: asset.creator_id,
      message: `Your asset '${asset.title}' was ${decision.replace('_', ' ')} by ${authUser.name}.`,
      asset_id: asset.id,
      read: false,
      created_at: new Date().toISOString(),
    })

    return sendJson(res, 200, {
      message: `Decision '${decision}' recorded.`,
      asset_id: asset.id,
      decision,
      passport_code: passportCode,
    })
  }

  // --- Insights (Brand Manager & Reviewer only) ---
  if (pathname.startsWith('/insights')) {
    if (authUser.role === 'creator') {
      return sendJson(res, 403, { detail: 'Insights dashboard is not accessible to creators' })
    }

    if (pathname === '/insights/overview' && method === 'GET') {
      const validPassports = db.passports.filter(p => p.status === 'valid').length
      const totalPassportsEver = db.passports.length
      const complianceRate = totalPassportsEver > 0 ? Number((validPassports / totalPassportsEver).toFixed(2)) : 0.67

      return sendJson(res, 200, {
        generated_at: new Date().toISOString(),
        totals: {
          assets: db.assets.length,
          approved_valid: db.passports.filter(p => p.status === 'valid').length,
          review_required: db.passports.filter(p => p.status === 'review_required').length,
          in_review: db.assets.filter(a => a.status === 'in_review').length,
          drafts: db.assets.filter(a => a.status === 'draft').length,
          withdrawn: db.passports.filter(p => p.status === 'withdrawn').length,
        },
        compliance_rate: complianceRate,
        pending_approvals: db.assets.filter(a => a.status === 'in_review').length,
        avg_hours_to_decision: 3.4,
        outdated_content: db.passports
          .filter(p => p.status === 'review_required')
          .map(p => {
            const ast = db.assets.find(a => a.id === p.asset_id)
            return {
              asset_id: p.asset_id,
              title: ast?.title || 'Asset',
              owner_name: db.users.find(u => u.id === ast?.creator_id)?.name || 'Creator',
              passport_code: p.code,
              fact_key: 'return_window_days',
              reason: 'Fact changed to v2',
            }
          }),
        findings_by_kind: {
          rule_violation: 12,
          fact_mismatch: 7,
          unsupported_claim: 3,
        },
        findings_by_severity: {
          high: 14,
          medium: 6,
          low: 2,
        },
      })
    }

    if (pathname === '/insights/violations' && method === 'GET') {
      const days = parseInt(parsedUrl.searchParams.get('days') || '30', 10)
      const byDay = []
      const now = new Date()
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000)
        byDay.push({
          date: d.toISOString().split('T')[0],
          count: (i % 5 === 0) ? 2 : (i % 3 === 0 ? 1 : 0),
        })
      }

      return sendJson(res, 200, {
        days,
        top_rules: [
          { rule_id: 'BT-001', label: 'cheap', kind: 'rule_violation', count: 8 },
          { rule_id: 'BT-002', label: 'best in the world', kind: 'rule_violation', count: 5 },
          { rule_id: 'BT-003', label: 'guaranteed', kind: 'rule_violation', count: 4 },
          { rule_id: 'CR-001', label: '% better', kind: 'rule_violation', count: 2 },
          { rule_id: null, label: 'fact_mismatch', kind: 'fact_mismatch', count: 3 },
        ],
        by_day: byDay,
        by_creator: [
          { user_id: 2, name: 'Dev Patel', count: 9 },
        ],
      })
    }

    if (pathname === '/insights/disputed-rules' && method === 'GET') {
      return sendJson(res, 200, [
        { rule_id: 'BT-003', label: 'guaranteed', raised: 6, dismissed: 4, dispute_rate: 0.67 },
        { rule_id: 'BT-001', label: 'cheap', raised: 8, dismissed: 3, dispute_rate: 0.38 },
        { rule_id: 'BT-002', label: 'best in the world', raised: 5, dismissed: 1, dispute_rate: 0.20 },
      ])
    }

    if (pathname === '/insights/assets' && method === 'GET') {
      return sendJson(res, 200, db.assets.map(a => {
        const passport = db.passports.find(p => p.asset_id === a.id)
        let comp = 'unknown'
        if (passport?.status === 'valid') comp = 'compliant'
        else if (passport?.status === 'review_required' || passport?.status === 'withdrawn') comp = 'non_compliant'
        else if (a.status === 'draft') comp = 'at_risk'

        return {
          asset_id: a.id,
          title: a.title,
          status: a.status,
          passport_status: passport ? passport.status : null,
          open_high: db.findings.filter(f => f.asset_id === a.id && f.status === 'open' && f.severity === 'high').length,
          open_total: db.findings.filter(f => f.asset_id === a.id && f.status === 'open').length,
          last_audited_at: a.created_at,
          compliance: comp,
        }
      }))
    }
  }

  // --- Admin Expiry Status ---
  if (pathname === '/admin/expiry-status' && method === 'GET') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can inspect expiry status' })
    }
    const upcoming = db.facts
      .filter(f => f.current_version.valid_until)
      .map(f => {
        const diffMs = new Date(f.current_version.valid_until).getTime() - Date.now()
        const daysLeft = Math.ceil(diffMs / 86400000)
        return {
          fact_id: f.id,
          key: f.key,
          valid_until: f.current_version.valid_until,
          days_left: daysLeft,
          linked_assets: db.passports.filter(p => p.linked_facts?.some(lf => lf.fact_id === f.id)).length,
        }
      })
      .sort((a, b) => a.days_left - b.days_left)

    return sendJson(res, 200, {
      ...db.expiryStatus,
      upcoming,
    })
  }

  if (pathname === '/admin/run-expiry-check' && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can trigger expiry checks' })
    }
    db.expiryStatus.last_run_at = new Date().toISOString()
    db.expiryStatus.last_run_source = 'manual'

    // Recall expired/expiring facts
    let affected = 0
    db.facts.forEach(f => {
      if (f.current_version.valid_until && new Date(f.current_version.valid_until).getTime() <= Date.now() + 3 * 86400000) {
        db.passports.forEach(p => {
          if (p.linked_facts?.some(lf => lf.fact_id === f.id) && p.status === 'valid') {
            p.status = 'review_required'
            affected++
          }
        })
      }
    })
    db.expiryStatus.last_result = { affected_assets_count: affected }

    return sendJson(res, 200, {
      checked_at: db.expiryStatus.last_run_at,
      affected_assets_count: affected,
      affected_assets: [],
    })
  }

  if (pathname === '/admin/reset-demo' && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can reset demo data' })
    }
    db = createInitialState()
    return sendJson(res, 200, { detail: 'Demo data restored' })
  }

  // --- Cron endpoint ---
  if (pathname === '/cron/expiry' && method === 'POST') {
    const cronSecret = req.headers['x-cron-secret']
    if (!cronSecret) return sendJson(res, 401, { detail: 'X-Cron-Secret header required' })
    return sendJson(res, 200, {
      checked_at: new Date().toISOString(),
      affected_assets_count: 0,
      affected_assets: [],
    })
  }

  // --- Passports Authenticated Detail & Withdraw ---
  const passportWithdrawMatch = pathname.match(/^\/passports\/([^/]+)\/withdraw$/)
  if (passportWithdrawMatch && method === 'POST') {
    if (authUser.role !== 'brand_manager') {
      return sendJson(res, 403, { detail: 'Only brand managers can withdraw passports' })
    }
    const code = passportWithdrawMatch[1]
    const passport = db.passports.find(p => p.code.toLowerCase() === code.toLowerCase())
    if (!passport) {
      return sendJson(res, 404, { detail: 'Passport not found' })
    }
    if (passport.status === 'withdrawn') {
      return sendJson(res, 409, { detail: 'Passport is already withdrawn' })
    }

    const body = await parseBody(req)
    if (!body.reason || body.reason.trim().length < 3) {
      return sendJson(res, 400, { detail: 'Withdrawal reason is required (minimum 3 characters)' })
    }

    passport.status = 'withdrawn'
    passport.withdrawn_reason = body.reason.trim()
    passport.withdrawn_at = new Date().toISOString()
    passport.withdrawn_by = authUser.name

    const asset = db.assets.find(a => a.id === passport.asset_id)
    if (asset) asset.status = 'withdrawn'

    return sendJson(res, 200, {
      code: passport.code,
      status: 'withdrawn',
      withdrawn_reason: passport.withdrawn_reason,
      withdrawn_at: passport.withdrawn_at,
      withdrawn_by: passport.withdrawn_by,
    })
  }

  const passportDetailMatch = pathname.match(/^\/passports\/([^/]+)$/)
  if (passportDetailMatch && method === 'GET') {
    const code = passportDetailMatch[1]
    const passport = db.passports.find(p => p.code.toLowerCase() === code.toLowerCase())
    if (!passport) {
      return sendJson(res, 404, { detail: 'Passport not found' })
    }
    return sendJson(res, 200, passport)
  }

  // --- Notifications ---
  if (pathname === '/notifications' && method === 'GET') {
    const userNotifications = db.notifications.filter(n => n.user_id === authUser.id)
    return sendJson(res, 200, userNotifications)
  }

  const readNotificationMatch = pathname.match(/^\/notifications\/(\d+)\/read$/)
  if (readNotificationMatch && method === 'PATCH') {
    const nId = parseInt(readNotificationMatch[1], 10)
    const notification = db.notifications.find(n => n.id === nId)
    if (notification) notification.read = true
    return sendJson(res, 200, { success: true })
  }

  // Not Found fallback
  return sendJson(res, 404, { detail: `Endpoint ${pathname} not found on mock server` })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[BrandPilot Mock Server] running on http://127.0.0.1:${PORT}`)
})
