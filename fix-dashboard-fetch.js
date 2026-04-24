// Rewrites the admin dashboard JS to fetch data via API instead of server-side embedding
const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

// ── 1. Add API endpoint that returns submissions as JSON ──────────────────────
const apiEndpoint = `
// ── API: Get active submissions as JSON (for admin dashboard) ─────────────────
app.get('/api/admin/data', requireAdmin, (req, res) => {
    db.all(\`SELECT * FROM submissions WHERE status != 'deleted' ORDER BY created_at DESC\`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── API: Get quarantine submissions as JSON ────────────────────────────────────
app.get('/api/admin/quarantine-data', requireAdmin, (req, res) => {
    db.all(\`SELECT * FROM submissions WHERE status = 'quarantine' ORDER BY created_at DESC\`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── API: Get deleted submissions as JSON ──────────────────────────────────────
app.get('/api/admin/deleted-data', requireAdmin, (req, res) => {
    db.all(\`SELECT * FROM submissions WHERE status = 'deleted' ORDER BY created_at DESC\`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
`;

// Insert before the submit endpoint
s = s.replace('// ── API: Submit form', apiEndpoint + '\n// ── API: Submit form');

// ── 2. Replace the embedded ALL_ROWS script with a fetch-based approach ───────
// In the active dashboard
s = s.replace(
`<script>
const ALL_ROWS = \${safeJson};
let filtered = [...ALL_ROWS];`,
`<script>
let ALL_ROWS = [];
let filtered = [];
async function loadData() {
    try {
        const r = await fetch('/api/admin/data');
        if (!r.ok) { document.body.innerHTML = '<div style="padding:2rem;color:red">Session expired. <a href="/api/admin/submissions">Login again</a></div>'; return; }
        ALL_ROWS = await r.json();
        filtered = [...ALL_ROWS];
        renderTable();
    } catch(e) { console.error('Failed to load data:', e); }
}
loadData();`
);

// Remove the manual renderTable() call at end of script since loadData() calls it
s = s.replace(
`['search-input','status-filter','type-filter','category-filter'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
});
renderTable();
<\\/script>
</body></html>\`;

        res.send(html);
    });
});

// ── Admin: Quarantine Page`,
`['search-input','status-filter','type-filter','category-filter'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
});
<\\/script>
</body></html>\`;

        res.send(html);
    });
});

// ── Admin: Quarantine Page`
);

// ── 3. Replace quarantine page embedded data with fetch ───────────────────────
s = s.replace(
`const Q_ROWS = \${safeJson};`,
`let Q_ROWS = [];
async function loadQData() {
    const r = await fetch('/api/admin/quarantine-data');
    if (!r.ok) return;
    Q_ROWS = await r.json();
    render();
}
loadQData();`
);
s = s.replace(
`render();
<\\/script>
</body></html>\`;
        res.send(html);
    });
});

// ── API: Accept quarantined`,
`<\\/script>
</body></html>\`;
        res.send(html);
    });
});

// ── API: Accept quarantined`
);

// ── 4. Replace deleted page embedded data with fetch ──────────────────────────
s = s.replace(
`const DEL_ROWS = \${safeJson};`,
`let DEL_ROWS = [];
async function loadDelData() {
    const r = await fetch('/api/admin/deleted-data');
    if (!r.ok) return;
    DEL_ROWS = await r.json();
    renderDel();
}
loadDelData();`
);
s = s.replace(
`document.getElementById('del-search').addEventListener('input', filterDel);
renderDel();
<\\/script>`,
`document.getElementById('del-search').addEventListener('input', filterDel);
<\\/script>`
);

// ── 5. Remove the db.all calls from the page route handlers (no longer needed for embedding) ──
// Active dashboard - just send the shell HTML without querying DB first
s = s.replace(
    `app.get('/api/admin/submissions', requireAdmin, (req, res) => {
    db.all(\`SELECT * FROM submissions WHERE status != 'deleted' ORDER BY created_at DESC\`, [], (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }

        const safeJson = safeJsonEmbed(rows);

        const html = \`\${adminHead('لوحة التحكم')}`,
    `app.get('/api/admin/submissions', requireAdmin, (req, res) => {
        const html = \`\${adminHead('لوحة التحكم')}`
);

// Close the removed db.all callback for active dashboard
// Find the pattern where the db.all closes before the quarantine page
const activeEnd = `        res.send(html);
    });
});

// ── Admin: Quarantine Page`;
const activeEndNew = `        res.send(html);
});

// ── Admin: Quarantine Page`;
s = s.replace(activeEnd, activeEndNew);

// Quarantine page - remove db.all wrapper
s = s.replace(
    `app.get('/api/admin/quarantine', requireAdmin, (req, res) => {
    db.all(\`SELECT * FROM submissions WHERE status = 'quarantine' ORDER BY created_at DESC\`, [], (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }
        const safeJson = safeJsonEmbed(rows);
        const html = \`\${adminHead('سلة المراجعة')}`,
    `app.get('/api/admin/quarantine', requireAdmin, (req, res) => {
        const html = \`\${adminHead('سلة المراجعة')}`
);
const quarEnd = `        res.send(html);
    });
});

// ── API: Accept quarantined`;
const quarEndNew = `        res.send(html);
});

// ── API: Accept quarantined`;
s = s.replace(quarEnd, quarEndNew);

// Deleted page - remove db.all wrapper
s = s.replace(
    `app.get('/api/admin/deleted', requireAdmin, (req, res) => {
    db.all(\`SELECT * FROM submissions WHERE status = 'deleted' ORDER BY created_at DESC\`, [], (err, rows) => {
        if (err) { res.status(500).json({ error: err.message }); return; }

        const safeJson = safeJsonEmbed(rows);

        const html = \`\${adminHead('المحذوفات')}`,
    `app.get('/api/admin/deleted', requireAdmin, (req, res) => {
        const html = \`\${adminHead('المحذوفات')}`
);
const delEnd = `        res.send(html);
    });
});

// ── API: Submit form`;
const delEndNew = `        res.send(html);
});

// ── API: Submit form`;
s = s.replace(delEnd, delEndNew);

fs.writeFileSync('server.js', s);
console.log('Done. Dashboard now uses fetch API instead of server-side embedding.');
