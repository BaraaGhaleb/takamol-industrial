// Patches server.js: replaces token-in-URL auth with cookie session auth
const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

// 1. Replace admin token constant and add session system
const oldToken = `// ── Admin token (set ADMIN_TOKEN env var to override the default) ─────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'takamol-admin-2026';`;

const newAuth = `// ── Admin credentials & cookie session ────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'takamol2026';
const crypto = require('crypto');
const sessions = new Map(); // sessionId -> expiry timestamp

function createSession() {
    const id = crypto.randomBytes(32).toString('hex');
    sessions.set(id, Date.now() + 8 * 60 * 60 * 1000); // 8 hours
    return id;
}
function isValidSession(id) {
    if (!id) return false;
    const exp = sessions.get(id);
    if (!exp) return false;
    if (Date.now() > exp) { sessions.delete(id); return false; }
    return true;
}
function parseCookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach(c => {
        const [k, v] = c.trim().split('=');
        if (k) out[decodeURIComponent(k.trim())] = decodeURIComponent((v||'').trim());
    });
    return out;
}`;

s = s.replace(oldToken, newAuth);

// 2. Replace requireAdmin function to use cookie instead of URL token
const oldRequireAdmin = `function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== ADMIN_TOKEN) {
        return res.status(401).send(\`
            <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
            <script src="https://cdn.tailwindcss.com"><\\/script></head>
            <body class="bg-gray-900 flex items-center justify-center min-h-screen">
            <div class="bg-gray-800 rounded-2xl p-10 max-w-sm w-full text-center">
                <div class="text-4xl mb-4">🔒</div>
                <h1 class="text-white text-2xl font-black mb-6">لوحة التحكم محمية</h1>
                <form method="get">
                    <input name="token" type="password" placeholder="أدخل رمز الدخول..." 
                        class="w-full bg-gray-700 text-white rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500 text-center tracking-widest">
                    <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">دخول</button>
                </form>
            </div></body></html>\`);
    }
    next();
}`;

const newRequireAdmin = `const LOGIN_PAGE = (err) => \`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>دخول المشرف</title>
<script src="https://cdn.tailwindcss.com"><\\/script>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
<style>body{font-family:'Tajawal',sans-serif}</style></head>
<body class="bg-gray-900 flex items-center justify-center min-h-screen">
<div class="bg-gray-800 rounded-2xl p-10 max-w-sm w-full text-center shadow-2xl">
    <div class="text-5xl mb-4">🔐</div>
    <h1 class="text-white text-2xl font-black mb-2">لوحة تحكم تكامل</h1>
    <p class="text-gray-400 text-sm mb-6">أدخل كلمة المرور للدخول</p>
    \${err ? '<div class="bg-red-900/50 text-red-300 rounded-xl p-3 mb-4 text-sm">'+err+'</div>' : ''}
    <form method="POST" action="/api/admin/login">
        <input name="redirect" type="hidden" value="/api/admin/submissions">
        <input name="password" type="password" placeholder="كلمة المرور..."
            autofocus autocomplete="current-password"
            class="w-full bg-gray-700 text-white rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500 text-center text-lg tracking-widest">
        <button type="submit" class="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-3 rounded-xl transition-all">دخول ← </button>
    </form>
</div></body></html>\`;

function requireAdmin(req, res, next) {
    const cookies = parseCookies(req);
    if (isValidSession(cookies.admin_session)) return next();
    res.status(401).send(LOGIN_PAGE(''));
}`;

s = s.replace(oldRequireAdmin, newRequireAdmin);

// 3. Add login POST route before the static middleware line
const staticLine = `// ── Serve static files from the current directory ─────────────────────────────
app.use(express.static(__dirname));`;

const loginRoute = `// ── Admin login POST ──────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
    const { password, redirect } = req.body;
    if (password === ADMIN_PASSWORD) {
        const sid = createSession();
        res.setHeader('Set-Cookie',
            \`admin_session=\${sid}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800\`);
        res.redirect(redirect || '/api/admin/submissions');
    } else {
        res.status(401).send(LOGIN_PAGE('كلمة المرور غير صحيحة، حاول مرة أخرى'));
    }
});

// ── Admin logout ───────────────────────────────────────────────────────────────
app.get('/api/admin/logout', (req, res) => {
    const cookies = parseCookies(req);
    sessions.delete(cookies.admin_session);
    res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
    res.redirect('/api/admin/submissions');
});

// ── Serve static files from the current directory ─────────────────────────────
app.use(express.static(__dirname));`;

s = s.replace(staticLine, loginRoute);

// 4. Fix the ADMIN_TOKEN references in embedded JS (replace with logout link instead)
// The embedded JS fetch calls used ADMIN_TOKEN header - now we use cookies automatically
// Replace all { 'X-Admin-Token': ADMIN_TOKEN } with empty headers (cookie sent automatically)
s = s.replace(/, headers: \{ 'X-Admin-Token': ADMIN_TOKEN \}/g, '');

// 5. Remove the ADMIN_TOKEN JS variable injections in dashboard HTML (no longer needed)
s = s.replace(/const ADMIN_TOKEN = '\$\{ADMIN_TOKEN\}';\n/g, '');

// 6. Fix validation: make phone min-length more lenient (3 chars trimmed, not 5)
s = s.replace(
    "if (!phone || typeof phone !== 'string' || phone.trim().length < 5 || phone.length > 30) {",
    "if (!phone || typeof phone !== 'string' || phone.replace(/[\\s+]/g,'').length < 3 || phone.length > 35) {"
);

// 7. Add logout button to admin nav
s = s.replace(
    `<a href="/api/admin/deleted" class="px-5 py-2.5 rounded-xl font-bold text-sm transition-colors \${active === 'deleted' ? 'bg-red-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}">🗑️ المحذوفات</a>
    </div>`,
    `<a href="/api/admin/deleted" class="px-5 py-2.5 rounded-xl font-bold text-sm transition-colors \${active === 'deleted' ? 'bg-red-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}">🗑️ المحذوفات</a>
        <a href="/api/admin/logout" class="mr-auto px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">خروج ↩</a>
    </div>`
);

fs.writeFileSync('server.js', s);
console.log('server.js patched successfully.');
console.log('Admin password:', 'takamol2026');
console.log('Login at: http://localhost:3000/api/admin/submissions');
