const fs = require('fs');

const files = [
    { name: 'index.html', type: 'general' },
    { name: 'maintenance.html', type: 'maintenance' },
    { name: 'supply.html', type: 'supply' },
    { name: 'consulting.html', type: 'consulting' }
];

files.forEach(file => {
    let content = fs.readFileSync(file.name, 'utf8');
    
    // Replace the form event listener
    const formRegex = /form\.addEventListener\('submit',\s*\(e\)\s*=>\s*\{[\s\S]*?\}\);/g;
    
    const newScript = `form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            const originalClass = btn.className;
            btn.innerHTML = 'جاري الإرسال...';
            
            const inputs = form.querySelectorAll('input, select, textarea');
            const data = {
                form_type: '${file.type}',
                name: inputs[0] ? inputs[0].value : '',
                company: inputs[0] ? inputs[0].value : '',
                phone: inputs[1] ? inputs[1].value : '',
                email: inputs[2] ? inputs[2].value : '',
                category: inputs[3] ? inputs[3].value : '',
                message: inputs[4] ? inputs[4].value : ''
            };

            try {
                const response = await fetch('http://localhost:3000/api/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if(response.ok) {
                    btn.innerHTML = '<i data-lucide="check-circle" class="inline w-6 h-6 ml-2"></i> تم إرسال طلبك بنجاح';
                    btn.className = 'w-full bg-green-600 text-white font-bold text-lg py-4 rounded-xl transition-all';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.className = originalClass;
                        form.reset();
                    }, 3000);
                } else {
                    throw new Error('Server error');
                }
            } catch (err) {
                console.error(err);
                btn.innerHTML = 'حدث خطأ في الاتصال بالسيرفر. تأكد من تشغيل Node.js';
                setTimeout(() => { btn.innerHTML = originalText; btn.className = originalClass; }, 3000);
            }
        });`;

    content = content.replace(formRegex, newScript);
    fs.writeFileSync(file.name, content);
});

console.log('All files updated successfully.');
