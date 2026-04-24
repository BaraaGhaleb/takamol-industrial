/**
 * Bug Fix Script
 * Fixes:
 * 1. Duplicate "أخرى" option in country_code select → replace with single "أخرى (other)" that toggles a custom input
 * 2. Wrong class "w-2/3 w-full" on phone input → fix to just "w-2/3"
 * 3. Fixed placeholder that says (5XX) → changed to generic (XXX XXX XXXX)
 * 4. Clears all old DB data
 * 5. Adds "أخرى" to dashboard type filter
 */

const fs = require('fs');

// ─── 1. Fix HTML files ────────────────────────────────────────────────────────
const files = ['index.html', 'consulting.html', 'maintenance.html', 'supply.html'];

const OLD_COUNTRY_SELECT = `<select name="country_code" class="w-1/3 bg-darker border border-white/10 rounded-xl px-2 py-3 text-white focus:outline-none focus:border-brandOrange transition-colors appearance-none text-center">
                                    <option value="+966" selected>🇸🇦 +966</option>
                                    <option value="+971">🇦🇪 +971</option>
                                    <option value="+965">🇰🇼 +965</option>
                                    <option value="+973">🇧🇭 +973</option>
                                    <option value="+974">🇶🇦 +974</option>
                                    <option value="+968">🇴🇲 +968</option>
                                    <option value="">أخرى</option>
                                    <option value="أخرى">أخرى</option>
                        </select>`;

const NEW_COUNTRY_SELECT = `<select name="country_code" id="country_code_select" onchange="handleCountryCodeChange(this)" class="w-1/3 bg-darker border border-white/10 rounded-xl px-2 py-3 text-white focus:outline-none focus:border-brandOrange transition-colors appearance-none text-center">
                                    <option value="+966" selected>🇸🇦 +966</option>
                                    <option value="+971">🇦🇪 +971</option>
                                    <option value="+965">🇰🇼 +965</option>
                                    <option value="+973">🇧🇭 +973</option>
                                    <option value="+974">🇶🇦 +974</option>
                                    <option value="+968">🇴🇲 +968</option>
                                    <option value="other">أخرى (أدخل الرمز)</option>
                        </select>`;

// Also fix the same select in supply.html (which has brandBlue in the class)
const OLD_COUNTRY_SELECT_SUPPLY = `<select name="country_code" class="w-1/3 bg-darker border border-white/10 rounded-xl px-2 py-3 text-white focus:outline-none focus:border-brandOrange transition-colors appearance-none text-center">
                                    <option value="+966" selected>🇸🇦 +966</option>
                                    <option value="+971">🇦🇪 +971</option>
                                    <option value="+965">🇰🇼 +965</option>
                                    <option value="+973">🇧🇭 +973</option>
                                    <option value="+974">🇶🇦 +974</option>
                                    <option value="+968">🇴🇲 +968</option>
                                    <option value="">أخرى</option>
                                    <option value="أخرى">أخرى</option>
                        </select>`;

// Custom code input to inject right after the phone div (before closing </div> of the ltr flex div)
const CUSTOM_CODE_INPUT = `<input type="text" name="custom_country_code" id="custom_country_code" placeholder="+XX" 
                                style="display:none;" 
                                class="w-1/3 bg-darker border border-white/10 rounded-xl px-2 py-3 text-white focus:outline-none focus:border-brandOrange transition-colors text-center">`;

// Inject the handler script into each page (before </body>)
const HANDLER_SCRIPT = `
    <script>
    function handleCountryCodeChange(sel) {
        const customInput = document.getElementById('custom_country_code');
        if(sel.value === 'other') {
            sel.style.display = 'none';
            customInput.style.display = '';
            customInput.focus();
        }
        customInput.onblur = function() {
            // Optional: allow switching back
        };
    }
    // Override form submission to use custom code if needed
    document.addEventListener('DOMContentLoaded', function() {
        const form = document.getElementById('contact-form');
        if(form) {
            form.addEventListener('submit', function(e) {
                const sel = document.getElementById('country_code_select');
                const custom = document.getElementById('custom_country_code');
                if(sel && sel.value === 'other' && custom && custom.value.trim()) {
                    // Temporarily override hidden input via dataset so FormData picks it up
                    sel.value = custom.value.trim();
                }
            }, true); // capture phase so it runs before the async handler
        }
    });
    </script>`;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // 1. Replace duplicate "other" options in country_code select
    content = content.replace(OLD_COUNTRY_SELECT, NEW_COUNTRY_SELECT);
    content = content.replace(OLD_COUNTRY_SELECT_SUPPLY, NEW_COUNTRY_SELECT);
    
    // 2. Fix "w-2/3 w-full" class bug on phone input (should be just w-2/3)
    content = content.replace(/class="w-2\/3 w-full bg-darker border border-white\/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brandOrange transition-colors" required>/g,
        'class="w-2/3 bg-darker border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brandOrange transition-colors" required>');
    content = content.replace(/class="w-2\/3 w-full bg-darker border border-white\/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brandSilver transition-colors" required>/g,
        'class="w-2/3 bg-darker border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brandSilver transition-colors" required>');
    content = content.replace(/class="w-2\/3 w-full bg-darker border border-white\/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brandBlue transition-colors" required>/g,
        'class="w-2/3 bg-darker border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brandBlue transition-colors" required>');

    // 3. Fix placeholder (remove Saudi-specific 5XX hint)
    content = content.replace(/placeholder="\(5XX\) XXX XXXX"/g, 'placeholder="XXX XXX XXXX"');
    
    // 4. Inject the custom code input after the closing </select> inside the phone flex div
    content = content.replace(
        `</select>
                                <input type="tel" name="phone"`,
        `</select>
                                ${CUSTOM_CODE_INPUT}
                                <input type="tel" name="phone"`
    );
    
    // 5. Inject handler script before </body>
    content = content.replace('</body>', HANDLER_SCRIPT + '\n</body>');

    fs.writeFileSync(file, content);
    console.log(`Fixed: ${file}`);
});

console.log('\nAll HTML files fixed.');
console.log('Now run: node clear-db.js  (to clear old data)');
console.log('Then restart server.js to apply dashboard filter fix.');
