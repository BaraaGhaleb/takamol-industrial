const fs = require('fs');

const files = [
    { name: 'index.html',       type: 'general' },
    { name: 'consulting.html',  type: 'consulting' },
    { name: 'maintenance.html', type: 'maintenance' },
    { name: 'supply.html',      type: 'supply' },
];

// The success block that currently just shows a message and resets after 3s
// We'll replace it with a redirect to ?submitted=1&id=X so the page reloads
// with a visible banner at the top.

files.forEach(({ name }) => {
    let content = fs.readFileSync(name, 'utf8');

    // ── 1. Replace the success block inside the submit handler ──────────────
    // Old: shows green button text, resets after 3 seconds
    content = content.replace(
        /if\(response\.ok\) \{\s*btn\.innerHTML = '[^']*تم إرسال طلبك بنجاح[^']*';\s*btn\.className = '[^']*';\s*if \(typeof lucide[^}]*\}\s*setTimeout\([^)]+\);\s*\} else \{/g,
        `if(response.ok) {
                    const result = await response.json().catch(() => ({}));
                    const reqId = result.id || '';
                    // Redirect: page refreshes and shows a banner at the top
                    window.location.href = window.location.pathname + '?submitted=1&id=' + reqId + '#contact';
                } else {`
    );

    // ── 2. Add a banner-detection script just before </body> ─────────────────
    const bannerScript = `
    <script>
    // Show success banner if redirected after form submission
    (function() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('submitted') === '1') {
            const reqId = params.get('id');
            const banner = document.createElement('div');
            banner.id = 'submission-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:12px;padding:16px 24px;background:linear-gradient(90deg,#16a34a,#15803d);color:#fff;font-family:Tajawal,sans-serif;font-size:1.1rem;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:opacity 0.6s;';
            banner.innerHTML = '✅ تم إرسال طلبك بنجاح!' + (reqId ? ' رقم طلبك هو: <span style="background:rgba(255,255,255,0.25);padding:2px 12px;border-radius:20px;margin-right:8px;">#' + reqId + '</span>' : '') + '<button onclick="document.getElementById(\'submission-banner\').style.opacity=\'0\';setTimeout(()=>document.getElementById(\'submission-banner\').remove(),600);" style="margin-right:auto;background:rgba(255,255,255,0.2);border:none;color:#fff;cursor:pointer;padding:4px 14px;border-radius:20px;font-size:0.9rem;">✕</button>';
            document.body.prepend(banner);
            // Auto-hide after 7 seconds
            setTimeout(() => {
                if (banner.parentNode) {
                    banner.style.opacity = '0';
                    setTimeout(() => banner.remove(), 600);
                }
            }, 7000);
            // Clean URL so refresh doesn't re-show the banner
            history.replaceState({}, '', window.location.pathname + '#contact');
        }
    })();
    <\/script>`;

    // Remove any previously injected banner script to stay idempotent
    content = content.replace(/\s*<script>\s*\/\/ Show success banner[\s\S]*?<\/script>/g, '');

    content = content.replace('</body>', bannerScript + '\n</body>');

    fs.writeFileSync(name, content);
    console.log('Patched:', name);
});

console.log('\nAll done.');
