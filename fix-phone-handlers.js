const fs = require('fs');

const files = ['index.html', 'consulting.html', 'maintenance.html', 'supply.html'];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // 1. Fix overly restrictive phone pattern (was [0-9]{9,15} = exactly 9-15 digits)
    //    ITU-T max is 15 digits, but with spaces/dashes up to ~20 chars
    //    Use a simple permissive pattern instead
    content = content.replace(
        /pattern="\[0-9\]\{9,15\}" title="Please enter a valid phone number"/g,
        'pattern="[0-9+\\-\\s]{5,20}" title="يرجى إدخال رقم هاتف صحيح (5-20 رقم)"'
    );

    // 2. Remove the duplicated conflicting handler script blocks injected by bugfix.js
    //    (they conflict with the main DOMContentLoaded listener)
    //    Remove EVERYTHING between the two script tags that contain handleCountryCodeChange
    const handlerScriptRegex = /\s*<script>\s*function handleCountryCodeChange[\s\S]*?<\/script>/g;
    content = content.replace(handlerScriptRegex, '');

    // 3. Now inject a clean, conflict-free version of the handler ONCE, just before </body>
    const cleanHandler = `
    <script>
    // Country code dropdown: show custom input when "other" is selected
    document.addEventListener('DOMContentLoaded', function() {
        const codeSelect = document.getElementById('country_code_select');
        const customInput = document.getElementById('custom_country_code');
        
        if (codeSelect && customInput) {
            codeSelect.addEventListener('change', function() {
                if (this.value === 'other') {
                    codeSelect.style.display = 'none';
                    customInput.style.display = '';
                    customInput.focus();
                }
            });

            // Allow clicking phone field to go back to dropdown
            customInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    codeSelect.value = '+966';
                    codeSelect.style.display = '';
                    customInput.style.display = 'none';
                    customInput.value = '';
                }
            });
        }

        // Patch form submission to use custom code value if "other" was selected
        const form = document.getElementById('contact-form');
        if (form && codeSelect && customInput) {
            form.addEventListener('submit', function() {
                if (codeSelect.style.display === 'none' && customInput.value.trim()) {
                    codeSelect.value = customInput.value.trim();
                    codeSelect.style.display = '';
                }
            }, true); // capture phase runs before the async submit handler
        }
    });
    <\/script>`;

    // Remove existing clean handler if already there (idempotent)
    content = content.replace(/\s*<script>\s*\/\/ Country code dropdown[\s\S]*?<\/script>/g, '');

    // Insert before </body>
    content = content.replace('</body>', cleanHandler + '\n</body>');

    fs.writeFileSync(file, content);
    console.log(`Patched: ${file}`);
});

console.log('\nAll files patched successfully.');
