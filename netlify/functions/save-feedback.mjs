import { getStore } from '@netlify/blobs';

/* ==========================================================================
   save-feedback.mjs  —  Netlify Serverless Function
   Replaces save_feedback.php.
   Receives feedback as JSON via POST, validates/sanitizes it (same rules as
   the PHP version), and persists it to Netlify Blob Storage.
   ========================================================================== */

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

/** Equivalent to PHP strip_tags() — removes any HTML/XML tags */
function stripTags(value) {
    return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
}

/** Simple RFC-5322-ish email check (mirrors PHP FILTER_VALIDATE_EMAIL) */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async (req, context) => {
    // ── Preflight ──────────────────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ success: false, error: 'Method not allowed' }),
            { status: 405, headers: CORS_HEADERS }
        );
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let data;
    try {
        data = await req.json();
    } catch {
        return new Response(
            JSON.stringify({ success: false, error: 'Invalid JSON' }),
            { status: 400, headers: CORS_HEADERS }
        );
    }

    // ── Sanitize (same rules as PHP version) ──────────────────────────────
    const ALLOWED_CATEGORIES = ['general', 'hardware', 'player', 'bug', 'feature'];

    const name     = stripTags(data.name);
    const email    = stripTags(data.email);
    const category = stripTags(data.category);
    const rating   = parseInt(data.rating, 10);
    const message  = stripTags(data.message);

    // ── Validate ───────────────────────────────────────────────────────────
    if (name.length < 1 || name.length > 100) {
        return new Response(
            JSON.stringify({ success: false, error: 'Invalid name' }),
            { status: 422, headers: CORS_HEADERS }
        );
    }

    if (!isValidEmail(email) || email.length > 255) {
        return new Response(
            JSON.stringify({ success: false, error: 'Invalid email' }),
            { status: 422, headers: CORS_HEADERS }
        );
    }

    const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'general';

    if (isNaN(rating) || rating < 1 || rating > 5) {
        return new Response(
            JSON.stringify({ success: false, error: 'Rating must be 1–5' }),
            { status: 422, headers: CORS_HEADERS }
        );
    }

    if (message.length < 1 || message.length > 2000) {
        return new Response(
            JSON.stringify({ success: false, error: 'Message must be 1–2000 characters' }),
            { status: 422, headers: CORS_HEADERS }
        );
    }

    // ── Build entry ────────────────────────────────────────────────────────
    const entry = {
        name,
        email,                  // stored privately, never sent back to clients
        category: safeCategory,
        rating,
        message,
        timestamp: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') ?? context.ip ?? 'unknown'
    };

    // ── Persist to Netlify Blob Storage ────────────────────────────────────
    try {
        const store = getStore('feedbacks');

        // Load existing list (or start fresh)
        let list = null;
        try {
            list = await store.get('list', { type: 'json' });
        } catch {
            list = null;
        }
        if (!Array.isArray(list)) list = [];

        // Prepend new entry and cap at 1000 (same as PHP version)
        list.unshift(entry);
        if (list.length > 1000) list = list.slice(0, 1000);

        await store.setJSON('list', list);
    } catch (err) {
        console.error('[save-feedback] Blob storage error:', err);
        return new Response(
            JSON.stringify({ success: false, error: 'Storage error' }),
            { status: 500, headers: CORS_HEADERS }
        );
    }

    // ── Respond — strip private fields before returning ───────────────────
    const { email: _e, ip: _ip, ...publicEntry } = entry;

    return new Response(
        JSON.stringify({ success: true, feedback: publicEntry }),
        { status: 200, headers: CORS_HEADERS }
    );
};

// Expose at /api/save-feedback (clean URL, no /.netlify/functions/ prefix needed)
export const config = {
    path: '/api/save-feedback'
};
