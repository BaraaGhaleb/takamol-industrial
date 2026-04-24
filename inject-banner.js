const fs = require('fs');
const files = ['index.html', 'consulting.html', 'maintenance.html', 'supply.html'];

const bannerScript = `
    <script>
    // Show success banner after form submission redirect
    (function() {
        var params = new URLSearchParams(window.location.search);
        if (params.get('submitted') === '1') {
            var reqId = params.get('id') || '';
            var banner = document.createElement('div');
            banner.id = 'submission-banner';
            banner.setAttribute('style', [
                'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
                'display:flex', 'align-items:center', 'justify-content:center',
                'gap:12px', 'padding:16px 24px',
                'background:linear-gradient(90deg,#16a34a,#15803d)',
                'color:#fff', 'font-family:Tajawal,sans-serif',
                'font-size:1.1rem', 'font-weight:700',
                'box-shadow:0 4px 24px rgba(0,0,0,0.35)',
                'animation:slideDown 0.4s ease'
            ].join(';'));

            var reqBadge = reqId
                ? ' \u0631\u0642\u0645 \u0637\u0644\u0628\u0643 \u0647\u0648: <span style="background:rgba(255,255,255,0.25);padding:2px 14px;border-radius:20px;margin-right:8px;">#' + reqId + '</span>'
                : '';

            var closeBtn = document.createElement('button');
            closeBtn.textContent = '\u00d7';
            closeBtn.setAttribute('style', 'margin-right:auto;background:rgba(0,0,0,0.2);border:none;color:#fff;cursor:pointer;padding:2px 12px;border-radius:20px;font-size:1.2rem;line-height:1;');
            closeBtn.onclick = function() { banner.remove(); };

            banner.innerHTML = '\u2705 \u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628\u0643 \u0628\u0646\u062c\u0627\u062d!' + reqBadge;
            banner.appendChild(closeBtn);
            document.body.prepend(banner);

            // Add slide-down animation
            var style = document.createElement('style');
            style.textContent = '@keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:none;opacity:1}}';
            document.head.appendChild(style);

            // Auto-remove after 8 seconds
            setTimeout(function() { if (banner.parentNode) banner.remove(); }, 8000);

            // Clean URL so hard-refresh doesn't re-show
            history.replaceState({}, '', window.location.pathname + '#contact');
        }
    })();
    <\/script>`;

files.forEach(function(f) {
    var content = fs.readFileSync(f, 'utf8');
    // Idempotent: remove previous injection
    content = content.replace(/\s*<script>\s*\/\/ Show success banner[\s\S]*?<\/script>/g, '');
    content = content.replace('</body>', bannerScript + '\n</body>');
    fs.writeFileSync(f, content);
    console.log('Banner injected:', f);
});
console.log('Done.');
