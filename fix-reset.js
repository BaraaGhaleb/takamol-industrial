const fs = require('fs');

const files = ['index.html', 'consulting.html', 'maintenance.html', 'supply.html'];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // Fix: after form.reset() we need to restore the country code UI (hide custom input, show select)
    // Find the setTimeout that calls form.reset() and add the UI reset there
    content = content.replace(
        /setTimeout\(\(\) => \{\s*btn\.innerHTML = originalText;\s*btn\.className = originalClass;\s*form\.reset\(\);\s*\}, 3000\);/g,
        `setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.className = originalClass;
                        form.reset();
                        // Restore country code UI after form reset
                        const codeSelect = document.getElementById('country_code_select');
                        const customCodeInput = document.getElementById('custom_country_code');
                        if (codeSelect && customCodeInput) {
                            codeSelect.value = '+966';
                            codeSelect.style.display = '';
                            customCodeInput.style.display = 'none';
                            customCodeInput.value = '';
                        }
                    }, 3000);`
    );

    fs.writeFileSync(file, content);
    console.log('Fixed reset:', file);
});

console.log('Done.');
