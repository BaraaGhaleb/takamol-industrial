const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// ── Admin credentials & persistent session store ──────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'takamol2026';
const crypto = require('crypto');
const fs_sync = require('fs');
const SESSION_FILE = path.join(__dirname, '.sessions.json');

// Load sessions from disk (survive server restarts)
let sessions = {};
try {
    if (fs_sync.existsSync(SESSION_FILE)) {
        sessions = JSON.parse(fs_sync.readFileSync(SESSION_FILE, 'utf8'));
        // Purge expired on load
        const now = Date.now();
        Object.keys(sessions).forEach(k => { if (sessions[k] < now) delete sessions[k]; });
    }
} catch(e) { sessions = {}; }

function saveSessions() {
    try { fs_sync.writeFileSync(SESSION_FILE, JSON.stringify(sessions)); } catch(e) {}
}

function createSession() {
    const id = crypto.randomBytes(32).toString('hex');
    sessions[id] = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
    saveSessions();
    return id;
}
function isValidSession(id) {
    if (!id) return false;
    const exp = sessions[id];
    if (!exp) return false;
    if (Date.now() > exp) { delete sessions[id]; saveSessions(); return false; }
    return true;
}
function parseCookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach(c => {
        const eqIdx = c.indexOf('=');
        if (eqIdx > 0) {
            const k = c.substring(0, eqIdx).trim();
            const v = c.substring(eqIdx + 1).trim();
            try { out[k] = decodeURIComponent(v); } catch(e) { out[k] = v; }
        }
    });
    return out;
}


// ── Security headers on every response ────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});

// ── Block direct access to sensitive files (DB, source, config) ───────────────
app.use((req, res, next) => {
    const blocked = /\.(sqlite|db|js|json|env|log|sh|bat|ps1)$/i;
    const url = req.path.toLowerCase();
    // Allow CDN-loaded scripts and the main HTML pages
    if (blocked.test(url) && !url.startsWith('/api')) {
        return res.status(403).send('Access denied');
    }
    next();
});

// ── CORS: allow all origins so user can submit from file:// ───────────────────────
app.use(cors());

// ── Body parsing with strict size limit (10kb max) ────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Simple in-memory rate limiter for /api/submit (no extra packages) ─────────
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 1000; // Increased from 10 to 1000 for testing
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    rateLimitMap.set(ip, entry);
    if (entry.count > maxRequests) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
}

// ── Admin auth middleware ─────────────────────────────────────────────────────
const LOGIN_PAGE = (err) => `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>دخول المشرف</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
<style>body{font-family:'Tajawal',sans-serif}</style></head>
<body class="bg-gray-900 flex items-center justify-center min-h-screen">
<div class="bg-gray-800 rounded-2xl p-10 max-w-sm w-full text-center shadow-2xl">
    <div class="text-5xl mb-4">🔐</div>
    <h1 class="text-white text-2xl font-black mb-2">لوحة تحكم تكامل</h1>
    <p class="text-gray-400 text-sm mb-6">أدخل كلمة المرور للدخول</p>
    ${err ? '<div class="bg-red-900/50 text-red-300 rounded-xl p-3 mb-4 text-sm">'+err+'</div>' : ''}
    <form method="POST" action="/api/admin/login">
        <input name="redirect" type="hidden" value="/api/admin/submissions">
        <input name="password" type="password" placeholder="كلمة المرور..."
            autofocus autocomplete="current-password"
            class="w-full bg-gray-700 text-white rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500 text-center text-lg tracking-widest">
        <button type="submit" class="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-3 rounded-xl transition-all">دخول ← </button>
    </form>
</div></body></html>`;

function requireAdmin(req, res, next) {
    const cookies = parseCookies(req);
    if (isValidSession(cookies.admin_session)) return next();
    // Return 200 so the browser doesn't block scripts on the login page
    res.status(200).send(LOGIN_PAGE(''));
}

// ── Admin login POST ──────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
    const { password, redirect } = req.body;
    if (password === ADMIN_PASSWORD) {
        const sid = createSession();
        const dest = redirect || '/api/admin/submissions';
        res.setHeader('Set-Cookie',
            `admin_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
        // Use HTML meta-refresh instead of 302 redirect so the cookie
        // is guaranteed to be stored before the browser navigates
        res.status(200).send(`<!DOCTYPE html><html><head>
            <meta charset="UTF-8">
            <meta http-equiv="refresh" content="0;url=${dest}">
            </head><body><script>window.location.replace('${dest}');<\/script></body></html>`);
    } else {
        res.status(200).send(LOGIN_PAGE('كلمة المرور غير صحيحة، حاول مرة أخرى'));
    }
});

// ── Admin logout ───────────────────────────────────────────────────────────────
app.get('/api/admin/logout', (req, res) => {
    const cookies = parseCookies(req);
    delete sessions[cookies.admin_session];
    res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.redirect('/api/admin/submissions');
});

// ── Serve static files from the current directory ─────────────────────────────
app.use(express.static(__dirname));

// ── Database ────────────────────────────────────────────────────────────────
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) { console.error('DB Error:', err); return; }
    console.log('Connected to SQLite database.');
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_type TEXT,
            name TEXT,
            company TEXT,
            phone TEXT,
            email TEXT,
            category TEXT,
            message TEXT,
            status TEXT DEFAULT 'pending',
            previous_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        // Add columns if upgrading from older schema (ignore errors if they exist)
        db.run("ALTER TABLE submissions ADD COLUMN status TEXT DEFAULT 'pending'", () => {});
        db.run("ALTER TABLE submissions ADD COLUMN previous_status TEXT DEFAULT 'pending'", () => {});
    });
});

// ── Helper: build safe JSON string for embedding in HTML ────────────────────
function safeJsonEmbed(data) {
    return JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

// ── Helper: shared admin CSS/head ───────────────────────────────────────────
function adminHead(title) {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Takamol Admin</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Tajawal', sans-serif; }
        tr { transition: background 0.15s; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen p-6">`;
}

// ── Helper: nav bar shared between admin pages ──────────────────────────────
function adminNav(active) {
    const btn = (href, label, key, color) =>
        `<a href="${href}" class="px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${active === key ? `bg-${color}-800 text-white` : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}">${label}</a>`;
    return `<div class="max-w-7xl mx-auto mb-6 flex items-center gap-3 flex-wrap">
        ${btn('/api/admin/submissions','📋 الطلبات النشطة','active','gray')}
        ${btn('/api/admin/quarantine','⚠️ المراجعة','quarantine','yellow')}
        ${btn('/api/admin/deleted','🗑️ المحذوفات','deleted','red')}
        <a href="/api/admin/logout" class="mr-auto px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">خروج ↩</a>
    </div>`;
}

// ── Admin: Active Submissions Dashboard ─────────────────────────────────────
app.get('/api/admin/submissions', requireAdmin, (req, res) => {
        const html = `${adminHead('لوحة التحكم')}
<div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-3xl font-black text-gray-900">لوحة تحكم المشرف</h1>
            <p class="text-gray-500 mt-1">طلبات الموقع - شركة تكامل للحلول الصناعية</p>
        </div>
        <div class="flex gap-3">
            <div class="bg-white border border-gray-200 rounded-xl px-5 py-3 text-center shadow-sm">
                <div id="count-total" class="text-3xl font-black text-gray-900">0</div>
                <div class="text-xs text-gray-500 mt-1">إجمالي الطلبات</div>
            </div>
            <div class="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3 text-center shadow-sm">
                <div id="count-pending" class="text-3xl font-black text-yellow-600">0</div>
                <div class="text-xs text-gray-500 mt-1">قيد الانتظار</div>
            </div>
        </div>
    </div>

    ${adminNav('active')}

    <!-- Filters (live, no Apply button) -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
        <div class="flex-1 min-w-64 relative">
            <svg class="w-5 h-5 absolute right-3 top-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input id="search-input" type="text" placeholder="بحث بالاسم، الشركة، الجوال، البريد..."
                   class="w-full border border-gray-200 rounded-xl pr-10 pl-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
        </div>
        <select id="status-filter" class="border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm min-w-36">
            <option value="all">كل الحالات</option>
            <option value="pending">قيد الانتظار</option>
            <option value="done">منجز</option>
        </select>
        <select id="type-filter" class="border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm min-w-36">
            <option value="all">كل النماذج</option>
            <option value="general">عام</option>
            <option value="consulting">استشارات</option>
            <option value="maintenance">صيانة وتشغيل</option>
            <option value="supply">توريدات</option>
        </select>
        <select id="category-filter" class="border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm min-w-36">
            <option value="all">كل التصنيفات</option>
            <option value="أخرى">أخرى</option>
        </select>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <div id="empty-state" class="hidden p-16 text-center text-gray-400">
            <div class="text-5xl mb-4">📭</div>
            <div class="text-xl font-bold">لا توجد طلبات مطابقة</div>
        </div>
        <table id="requests-table" class="w-full text-sm">
            <thead class="bg-gray-900 text-white">
                <tr>
                    <th class="p-4 text-right font-bold">#</th>
                    <th class="p-4 text-right font-bold">المستخدم</th>
                    <th class="p-4 text-right font-bold">الاتصال</th>
                    <th class="p-4 text-right font-bold">النموذج</th>
                    <th class="p-4 text-right font-bold">التصنيف</th>
                    <th class="p-4 text-right font-bold">الرسالة</th>
                    <th class="p-4 text-right font-bold">التاريخ</th>
                    <th class="p-4 text-right font-bold">الحالة</th>
                    <th class="p-4 text-right font-bold">إجراءات</th>
                </tr>
            </thead>
            <tbody id="table-body"></tbody>
        </table>
    </div>
</div>

<script>
let ALL_ROWS = [];
let filtered = [];
async function loadData() {
    try {
        const r = await fetch('/api/admin/data', { credentials: 'include' });
        if (!r.ok) { document.body.innerHTML = '<div style="padding:2rem;color:red">Session expired. <a href="/api/admin/submissions">Login again</a></div>'; return; }
        ALL_ROWS = await r.json();
        filtered = [...ALL_ROWS];
        renderTable();
    } catch(e) { console.error('Failed to load data:', e); }
}
loadData();

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleString('ar-SA'); } catch(e) { return d; }
}

function applyFilters() {
    const search = document.getElementById('search-input').value.trim().toLowerCase();
    const status = document.getElementById('status-filter').value;
    const type   = document.getElementById('type-filter').value;
    const cat    = document.getElementById('category-filter').value;
    filtered = ALL_ROWS.filter(r => {
        const ms = !search ||
            (r.name||'').toLowerCase().includes(search) ||
            (r.company||'').toLowerCase().includes(search) ||
            (r.phone||'').toLowerCase().includes(search) ||
            (r.email||'').toLowerCase().includes(search) ||
            (r.message||'').toLowerCase().includes(search);
        const mSt = status === 'all' || (r.status||'pending') === status;
        const mTy = type === 'all' || (r.form_type||'') === type;
        const mCa = cat === 'all' || (r.category||'').includes(cat);
        return ms && mSt && mTy && mCa;
    });
    renderTable();
}

function renderTable() {
    const tbody   = document.getElementById('table-body');
    const empty   = document.getElementById('empty-state');
    const table   = document.getElementById('requests-table');
    document.getElementById('count-total').textContent   = ALL_ROWS.length;
    document.getElementById('count-pending').textContent = ALL_ROWS.filter(r=>(r.status||'pending')==='pending').length;
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        table.classList.add('hidden');
        return;
    }
    empty.classList.add('hidden');
    table.classList.remove('hidden');
    tbody.innerHTML = filtered.map(r => {
        const isDone = (r.status||'pending') === 'done';
        const badge  = isDone
            ? '<span class="bg-gray-500 text-white text-xs px-3 py-1 rounded-full font-bold">منجز</span>'
            : '<span class="bg-yellow-400 text-yellow-900 text-xs px-3 py-1 rounded-full font-bold">قيد الانتظار</span>';
        const doneBtn = !isDone
            ? '<button onclick="markDone('+r.id+')" class="w-full mb-1 text-green-700 bg-green-50 border border-green-200 hover:bg-green-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">✓ إنجاز</button>'
            : '';
        const delBtn = '<button onclick="softDelete('+r.id+')" class="w-full text-red-700 bg-red-50 border border-red-200 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">🗑 حذف</button>';
        return '<tr class="border-b border-gray-100 '+(isDone?'bg-gray-50 opacity-60':'hover:bg-blue-50')+'">' +
            '<td class="p-4 text-gray-400 font-bold">'+r.id+'</td>' +
            '<td class="p-4"><div class="font-bold text-gray-900">'+esc(r.name||r.company||'غير محدد')+'</div><div class="text-gray-500 text-xs">'+esc(r.company||'')+'</div></td>' +
            '<td class="p-4"><div dir="ltr" class="text-gray-800 font-medium text-xs">'+esc(r.phone||'-')+'</div><div class="text-gray-500 text-xs">'+esc(r.email||'')+'</div></td>' +
            '<td class="p-4"><span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-lg font-bold">'+esc(r.form_type||'')+'</span></td>' +
            '<td class="p-4 text-gray-700 text-xs max-w-24">'+esc(r.category||'')+'</td>' +
            '<td class="p-4 text-gray-600 max-w-48"><div class="truncate" title="'+esc(r.message||'')+'">'+esc(r.message||'')+'</div></td>' +
            '<td class="p-4 text-gray-500 text-xs whitespace-nowrap">'+fmt(r.created_at)+'</td>' +
            '<td class="p-4">'+badge+'</td>' +
            '<td class="p-4 min-w-28">'+doneBtn+delBtn+'</td>' +
        '</tr>';
    }).join('');
}

async function markDone(id) {
    if (!confirm('هل أنت متأكد من إنجاز هذا الطلب؟')) return;
    const res = await fetch('/api/admin/submissions/' + id + '/done', { method: 'POST' });
    if (res.ok) window.location.reload();
    else alert('فشل: ' + res.status);
}

async function softDelete(id) {
    if (!confirm('هل تريد نقل هذا الطلب إلى سلة المحذوفات؟\\nيمكنك استعادته لاحقاً من صفحة المحذوفات.')) return;
    const res = await fetch('/api/admin/submissions/' + id + '/soft-delete', { method: 'POST' });
    if (res.ok) window.location.reload();
    else alert('فشل: ' + res.status);
}

['search-input','status-filter','type-filter','category-filter'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
});
<\/script>
</body></html>`;

        res.send(html);
});

// ── Admin: Quarantine Page ────────────────────────────────────────────────────
app.get('/api/admin/quarantine', requireAdmin, (req, res) => {
        const html = `${adminHead('سلة المراجعة')}
<div class="max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-3xl font-black text-yellow-700">⚠️ طلبات المراجعة</h1>
            <p class="text-gray-500 mt-1">طلبات لم تستوفِ المعايير التلقائية - راجعها يدوياً وقرر قبولها أو حذفها</p>
        </div>
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3 text-center shadow-sm">
            <div id="count-q" class="text-3xl font-black text-yellow-600">0</div>
            <div class="text-xs text-gray-500 mt-1">طلب للمراجعة</div>
        </div>
    </div>
    ${adminNav('quarantine')}
    <div class="bg-yellow-50 border border-yellow-300 rounded-2xl p-4 mb-6 text-yellow-800 text-sm font-medium">
        ℹ️ هذه الطلبات وصلت للسيرفر ولكنها لم تجتز التحقق التلقائي. اضغط <b>قبول</b> لنقلها للطلبات النشطة، أو <b>حذف نهائي</b> للإزالة من قاعدة البيانات.
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <div id="empty-q" class="hidden p-16 text-center text-gray-400">
            <div class="text-5xl mb-4">✅</div>
            <div class="text-xl font-bold">لا توجد طلبات في المراجعة</div>
        </div>
        <table id="q-table" class="w-full text-sm">
            <thead class="bg-yellow-700 text-white">
                <tr>
                    <th class="p-4 text-right font-bold">#</th>
                    <th class="p-4 text-right font-bold">المستخدم</th>
                    <th class="p-4 text-right font-bold">الاتصال</th>
                    <th class="p-4 text-right font-bold">النموذج</th>
                    <th class="p-4 text-right font-bold">التصنيف</th>
                    <th class="p-4 text-right font-bold">الرسالة</th>
                    <th class="p-4 text-right font-bold">التاريخ</th>
                    <th class="p-4 text-right font-bold">إجراءات</th>
                </tr>
            </thead>
            <tbody id="q-body"></tbody>
        </table>
    </div>
</div>
<script>
let Q_ROWS = [];
async function loadQData() {
    const r = await fetch('/api/admin/quarantine-data');
    if (!r.ok) return;
    Q_ROWS = await r.json();
    render();
}
loadQData();
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmt(d){if(!d)return'';try{return new Date(d).toLocaleString('ar-SA');}catch(e){return d;}}
function render(){
    const tbody=document.getElementById('q-body');
    const empty=document.getElementById('empty-q');
    const table=document.getElementById('q-table');
    document.getElementById('count-q').textContent=Q_ROWS.length;
    if(!Q_ROWS.length){empty.classList.remove('hidden');table.classList.add('hidden');return;}
    empty.classList.add('hidden');table.classList.remove('hidden');
    tbody.innerHTML=Q_ROWS.map(r=>{
        const acceptBtn='<button onclick="acceptReq('+r.id+')" class="w-full mb-1 text-green-700 bg-green-50 border border-green-200 hover:bg-green-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">✓ قبول</button>';
        const delBtn='<button onclick="permDel('+r.id+')" class="w-full text-white bg-red-600 border border-red-700 hover:bg-red-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">✕ حذف نهائي</button>';
        return '<tr class="border-b border-yellow-100 bg-yellow-50/30 hover:bg-yellow-50">'+
            '<td class="p-4 text-gray-400 font-bold">'+r.id+'</td>'+
            '<td class="p-4"><div class="font-bold text-gray-900">'+esc(r.name||r.company||'غير محدد')+'</div><div class="text-gray-500 text-xs">'+esc(r.company||'')+'</div></td>'+
            '<td class="p-4"><div dir="ltr" class="text-gray-800 text-xs">'+esc(r.phone||'-')+'</div><div class="text-gray-500 text-xs">'+esc(r.email||'')+'</div></td>'+
            '<td class="p-4"><span class="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-lg font-bold">'+esc(r.form_type||'')+'</span></td>'+
            '<td class="p-4 text-gray-700 text-xs">'+esc(r.category||'')+'</td>'+
            '<td class="p-4 text-gray-600 max-w-48"><div class="truncate" title="'+esc(r.message||'')+'">'+esc(r.message||'')+'</div></td>'+
            '<td class="p-4 text-gray-500 text-xs whitespace-nowrap">'+fmt(r.created_at)+'</td>'+
            '<td class="p-4 min-w-36">'+acceptBtn+delBtn+'</td>'+
        '</tr>';
    }).join('');
}
async function acceptReq(id){
    if(!confirm('قبول هذا الطلب ونقله للطلبات النشطة؟'))return;
    const r=await fetch('/api/admin/submissions/'+id+'/accept',{method:'POST'});
    if(r.ok)window.location.reload();else alert('فشل: '+r.status);
}
async function permDel(id){
    if(!confirm('⚠️ هل أنت متأكد من الحذف النهائي؟\\nهذا الإجراء لا يمكن التراجع عنه!'))return;
    if(!confirm('تأكيد أخير: سيُحذف هذا الطلب نهائياً من قاعدة البيانات.'))return;
    const r=await fetch('/api/admin/submissions/'+id+'/quarantine-delete',{method:'DELETE'});
    if(r.ok)window.location.reload();else alert('فشل: '+r.status);
}
<\/script>
</body></html>`;
        res.send(html);
});

// ── API: Accept quarantined submission (move to pending) ──────────────────────
app.post('/api/admin/submissions/:id/accept', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    db.run("UPDATE submissions SET status='pending', previous_status='quarantine' WHERE id=? AND status='quarantine'", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found or not quarantined' });
        res.json({ success: true });
    });
});

// ── API: Permanent delete from quarantine ─────────────────────────────────────
app.delete('/api/admin/submissions/:id/quarantine-delete', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    db.run("DELETE FROM submissions WHERE id=? AND status='quarantine'", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found or not in quarantine' });
        res.json({ success: true });
    });
});

// ── Admin: Deleted Requests Page ─────────────────────────────────────────────
app.get('/api/admin/deleted', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM submissions WHERE status = 'deleted' ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }

        const safeJson = safeJsonEmbed(rows);

        const html = `${adminHead('سلة المحذوفات')}
<div class="max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-3xl font-black text-red-700">🗑️ سلة المحذوفات</h1>
            <p class="text-gray-500 mt-1">الطلبات المحذوفة - يمكن استعادتها أو حذفها نهائياً</p>
        </div>
        <div class="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-center shadow-sm">
            <div id="count-del" class="text-3xl font-black text-red-600">0</div>
            <div class="text-xs text-gray-500 mt-1">طلب محذوف</div>
        </div>
    </div>

    ${adminNav('deleted')}

    <!-- Search -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6 flex gap-3">
        <div class="flex-1 relative">
            <svg class="w-5 h-5 absolute right-3 top-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input id="del-search" type="text" placeholder="بحث في المحذوفات..."
                   class="w-full border border-gray-200 rounded-xl pr-10 pl-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400 text-sm">
        </div>
    </div>

    <div class="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-red-700 text-sm font-medium">
        ⚠️ تحذير: الحذف النهائي لا يمكن التراجع عنه. سيُطلب منك تأكيد مزدوج قبل الحذف الدائم.
    </div>

    <!-- Table -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
        <div id="empty-del" class="hidden p-16 text-center text-gray-400">
            <div class="text-5xl mb-4">✅</div>
            <div class="text-xl font-bold">سلة المحذوفات فارغة</div>
        </div>
        <table id="del-table" class="w-full text-sm">
            <thead class="bg-red-800 text-white">
                <tr>
                    <th class="p-4 text-right font-bold">#</th>
                    <th class="p-4 text-right font-bold">المستخدم</th>
                    <th class="p-4 text-right font-bold">الاتصال</th>
                    <th class="p-4 text-right font-bold">النموذج</th>
                    <th class="p-4 text-right font-bold">التصنيف</th>
                    <th class="p-4 text-right font-bold">الرسالة</th>
                    <th class="p-4 text-right font-bold">التاريخ</th>
                    <th class="p-4 text-right font-bold">إجراءات</th>
                </tr>
            </thead>
            <tbody id="del-body"></tbody>
        </table>
    </div>
</div>

<script>
let DEL_ROWS = [];
let delFiltered = [];
async function loadDelData() {
    const r = await fetch('/api/admin/deleted-data');
    if (!r.ok) return;
    DEL_ROWS = await r.json();
    delFiltered = [...DEL_ROWS];
    renderDel();
}
loadDelData();

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleString('ar-SA'); } catch(e) { return d; }
}

function filterDel() {
    const search = document.getElementById('del-search').value.trim().toLowerCase();
    delFiltered = DEL_ROWS.filter(r =>
        !search ||
        (r.name||'').toLowerCase().includes(search) ||
        (r.company||'').toLowerCase().includes(search) ||
        (r.phone||'').toLowerCase().includes(search) ||
        (r.email||'').toLowerCase().includes(search)
    );
    renderDel();
}

function renderDel() {
    const tbody = document.getElementById('del-body');
    const empty = document.getElementById('empty-del');
    const table = document.getElementById('del-table');
    document.getElementById('count-del').textContent = DEL_ROWS.length;
    if (delFiltered.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        table.classList.add('hidden');
        return;
    }
    empty.classList.add('hidden');
    table.classList.remove('hidden');
    tbody.innerHTML = delFiltered.map(r => {
        const restoreBtn = '<button onclick="restoreReq('+r.id+')" class="w-full mb-1 text-green-700 bg-green-50 border border-green-200 hover:bg-green-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">↩ استعادة</button>';
        const permDelBtn = '<button onclick="permDelete('+r.id+')" class="w-full text-white bg-red-600 border border-red-700 hover:bg-red-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">🗑 حذف نهائي</button>';
        return '<tr class="border-b border-red-100 bg-red-50/30 hover:bg-red-50">' +
            '<td class="p-4 text-gray-400 font-bold">'+r.id+'</td>' +
            '<td class="p-4"><div class="font-bold text-gray-900">'+esc(r.name||r.company||'غير محدد')+'</div><div class="text-gray-500 text-xs">'+esc(r.company||'')+'</div></td>' +
            '<td class="p-4"><div dir="ltr" class="text-gray-800 font-medium text-xs">'+esc(r.phone||'-')+'</div><div class="text-gray-500 text-xs">'+esc(r.email||'')+'</div></td>' +
            '<td class="p-4"><span class="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-lg font-bold">'+esc(r.form_type||'')+'</span></td>' +
            '<td class="p-4 text-gray-700 text-xs">'+esc(r.category||'')+'</td>' +
            '<td class="p-4 text-gray-600 max-w-48"><div class="truncate" title="'+esc(r.message||'')+'">'+esc(r.message||'')+'</div></td>' +
            '<td class="p-4 text-gray-500 text-xs whitespace-nowrap">'+fmt(r.created_at)+'</td>' +
            '<td class="p-4 min-w-36">'+restoreBtn+permDelBtn+'</td>' +
        '</tr>';
    }).join('');
}

async function restoreReq(id) {
    if (!confirm('هل تريد استعادة هذا الطلب إلى الطلبات النشطة؟')) return;
    const res = await fetch('/api/admin/submissions/' + id + '/restore', { method: 'POST' });
    if (res.ok) window.location.reload();
    else alert('فشل الاستعادة: ' + res.status);
}

async function permDelete(id) {
    // Double confirmation for permanent delete
    const first  = confirm('⚠️ هل أنت متأكد من الحذف النهائي؟\\nهذا الإجراء لا يمكن التراجع عنه!');
    if (!first) return;
    const second = confirm('تأكيد أخير: سيتم حذف هذا الطلب من قاعدة البيانات نهائياً.\\nهل تريد المتابعة؟');
    if (!second) return;
    const res = await fetch('/api/admin/submissions/' + id + '/permanent-delete', { method: 'DELETE' });
    if (res.ok) window.location.reload();
    else alert('فشل الحذف النهائي: ' + res.status);
}

document.getElementById('del-search').addEventListener('input', filterDel);
<\/script>
</body></html>`;

        res.send(html);
    });
});


// ── API: Get active submissions as JSON (for admin dashboard) ─────────────────
app.get('/api/admin/data', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM submissions WHERE status != 'deleted' ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── API: Get quarantine submissions as JSON ────────────────────────────────────
app.get('/api/admin/quarantine-data', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM submissions WHERE status = 'quarantine' ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── API: Get deleted submissions as JSON ──────────────────────────────────────
app.get('/api/admin/deleted-data', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM submissions WHERE status = 'deleted' ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── API: Submit form ── saves ALL submissions; suspicious ones go to quarantine ─
const ALLOWED_FORM_TYPES = ['general', 'consulting', 'maintenance', 'supply'];

app.post('/api/submit', rateLimit, (req, res) => {
    const { form_type, name, company, phone, email, category, message } = req.body;

    // Collect validation warnings (no longer reject - quarantine instead)
    const warnings = [];

    if (!form_type || !ALLOWED_FORM_TYPES.includes(form_type)) {
        warnings.push('invalid_form_type');
    }
    if (phone && /<|>|script|on\w+=/i.test(phone)) {
        warnings.push('suspicious_phone');
    }

    // Determine status: quarantine if warnings exist, else pending
    const status = warnings.length > 0 ? 'quarantine' : 'pending';

    // Sanitize all fields defensively
    const safe = {
        form_type: (ALLOWED_FORM_TYPES.includes(form_type) ? form_type : 'general').trim(),
        name: ((name || company || 'غير محدد')).toString().trim().slice(0, 200),
        company: (company || '').toString().trim().slice(0, 200),
        phone: (phone || '').toString().trim().slice(0, 50),
        email: (email || '').toString().trim().toLowerCase().slice(0, 254),
        category: (category || '').toString().trim().slice(0, 100),
        message: (message || '').toString().trim().slice(0, 2000)
    };

    db.run(
        `INSERT INTO submissions (form_type, name, company, phone, email, category, message, status) VALUES (?,?,?,?,?,?,?,?)`,
        [safe.form_type, safe.name, safe.company, safe.phone, safe.email, safe.category, safe.message, status],
        function(err) {
            if (err) { console.error(err); res.status(500).json({ error: 'DB error' }); return; }
            console.log(`New submission ID: ${this.lastID} | Status: ${status} | From: ${safe.email} | IP: ${req.ip}`);
            // Return success to the browser regardless (quarantine is invisible to submitter)
            res.status(200).json({ success: true, id: this.lastID });
        }
    );
});


// ── API: Mark as done ─────────────────────────────────────────────────
app.post('/api/admin/submissions/:id/done', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    db.run("UPDATE submissions SET status='done' WHERE id=?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// ── API: Soft delete (move to deleted bin, preserving previous status) ────────
app.post('/api/admin/submissions/:id/soft-delete', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    // First read the current status so we can restore it correctly later
    db.get("SELECT status FROM submissions WHERE id=?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Not found' });
        const prevStatus = row.status || 'pending';
        db.run("UPDATE submissions SET previous_status=?, status='deleted' WHERE id=?", [prevStatus, id], function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true });
        });
    });
});

// ── API: Restore from deleted bin (back to previous status) ─────────────────
app.post('/api/admin/submissions/:id/restore', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const VALID_STATUSES = ['pending', 'done'];
    db.get("SELECT previous_status FROM submissions WHERE id=?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Not found' });
        // Whitelist: only restore to known-good statuses
        const restoreStatus = VALID_STATUSES.includes(row.previous_status) ? row.previous_status : 'pending';
        db.run("UPDATE submissions SET status=?, previous_status=NULL WHERE id=?", [restoreStatus, id], function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, restoredTo: restoreStatus });
        });
    });
});

// ── API: Permanent delete (only from deleted bin) ────────────────────────────────
app.delete('/api/admin/submissions/:id/permanent-delete', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    db.run("DELETE FROM submissions WHERE id=? AND status='deleted'", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found or not in deleted state' });
        res.json({ success: true });
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Active requests:  http://localhost:${PORT}/api/admin/submissions`);
    console.log(`Deleted requests: http://localhost:${PORT}/api/admin/deleted`);
});
