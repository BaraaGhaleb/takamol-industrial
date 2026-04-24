const fs = require('fs');

const files = [
    { name: 'index.html', type: 'general' },
    { name: 'maintenance.html', type: 'maintenance' },
    { name: 'supply.html', type: 'supply' },
    { name: 'consulting.html', type: 'consulting' }
];

files.forEach(file => {
    let content = fs.readFileSync(file.name, 'utf8');

    // 1. Fix HTML inputs
    // Name/Company
    content = content.replace(/<input type="text" class="w-full([^"]*)" required>/g, '<input type="text" name="company" class="w-full$1" required>');
    // Phone
    content = content.replace(/<input type="tel" class="w-full([^"]*)" required>/g, '<input type="tel" name="phone" pattern="[0-9+\\- ]+" title="Please enter a valid phone number" class="w-full$1" required>');
    // Email
    content = content.replace(/<input type="email" class="w-full([^"]*)" required>/g, '<input type="email" name="email" pattern="[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}" title="Please enter a valid email address" class="w-full$1" required>');
    // Select
    content = content.replace(/<select class="w-full([^"]*)">/g, '<select name="category" class="w-full$1" required>');
    // Textarea
    content = content.replace(/<textarea rows="4" class="w-full([^"]*)"><\/textarea>/g, '<textarea name="message" rows="4" class="w-full$1" required></textarea>');

    // 2. Fix JS logic
    const formRegex = /form\.addEventListener\('submit',\s*(?:async\s*)?\(e\)\s*=>\s*\{[\s\S]*?\}\);/g;
    
    const newScript = `form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            const originalClass = btn.className;
            btn.innerHTML = 'جاري الإرسال...';
            
            const formData = new FormData(form);
            const data = {
                form_type: '${file.type}',
                name: formData.get('company') || '',
                company: formData.get('company') || '',
                phone: formData.get('phone') || '',
                email: formData.get('email') || '',
                category: formData.get('category') || '',
                message: formData.get('message') || ''
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
