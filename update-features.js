const fs = require('fs');

const files = ['index.html', 'consulting.html', 'maintenance.html', 'supply.html'];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // 1. Phone Input update
    const phoneInputRegex = /<input type="tel" name="phone" [^>]*class="([^"]*)" required>/g;
    const phoneInputReplacement = `<div class="flex gap-2" dir="ltr">
                                <select name="country_code" class="w-1/3 bg-darker border border-white/10 rounded-xl px-2 py-3 text-white focus:outline-none focus:border-brandOrange transition-colors appearance-none text-center">
                                    <option value="+966" selected>🇸🇦 +966</option>
                                    <option value="+971">🇦🇪 +971</option>
                                    <option value="+965">🇰🇼 +965</option>
                                    <option value="+973">🇧🇭 +973</option>
                                    <option value="+974">🇶🇦 +974</option>
                                    <option value="+968">🇴🇲 +968</option>
                                    <option value="">أخرى</option>
                                </select>
                                <input type="tel" name="phone" placeholder="(5XX) XXX XXXX" pattern="[0-9]{9,15}" title="Please enter a valid phone number" class="w-2/3 $1" required>
                            </div>`;
    content = content.replace(phoneInputRegex, phoneInputReplacement);

    // 2. Add 'أخرى' to category select
    if (!content.includes('<option value="أخرى">أخرى</option>')) {
        content = content.replace(/<\/select>/g, '    <option value="أخرى">أخرى</option>\n                        </select>');
    }

    // 3. Update JS Submission Logic
    const oldPhoneJs = "phone: formData.get('phone') || '',";
    const newPhoneJs = "phone: (formData.get('country_code') || '') + ' ' + (formData.get('phone') || ''),";
    content = content.replace(oldPhoneJs, newPhoneJs);

    fs.writeFileSync(file, content);
});

// 4. Add Partners Section to index.html
let indexContent = fs.readFileSync('index.html', 'utf8');
if (!indexContent.includes('<!-- Partners Section -->')) {
    const partnersSection = `
    <!-- Partners Section -->
    <section class="py-16 bg-card border-t border-white/5 relative overflow-hidden">
        <div class="max-w-7xl mx-auto px-6 mb-10 text-center reveal-element">
            <h3 class="text-3xl font-black text-white mb-2">شركاء <span class="text-brandOrange">النجاح</span></h3>
            <p class="text-gray-400">نفخر بالعمل مع نخبة من المؤسسات الرائدة</p>
        </div>
        
        <!-- Marquee Container -->
        <div class="relative flex overflow-x-hidden group">
            <div class="py-4 flex gap-12 animate-marquee whitespace-nowrap px-6 items-center">
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 1</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 2</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 3</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 4</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 5</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 6</div>
            </div>
            <!-- Duplicate for infinite effect -->
            <div class="absolute top-0 py-4 flex gap-12 animate-marquee2 whitespace-nowrap px-6 items-center">
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 1</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 2</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 3</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 4</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 5</div>
                <div class="w-40 h-20 bg-darker border border-white/10 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300">شريك 6</div>
            </div>
        </div>
        <!-- Gradient Fades -->
        <div class="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none"></div>
        <div class="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none"></div>
    </section>

    <style>
        .animate-marquee { animation: marquee 25s linear infinite; }
        .animate-marquee2 { animation: marquee2 25s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(100%); } }
        @keyframes marquee2 { 0% { transform: translateX(-100%); } 100% { transform: translateX(0%); } }
    </style>

    <!-- Footer -->`;
    
    indexContent = indexContent.replace('<!-- Footer -->', partnersSection);
    fs.writeFileSync('index.html', indexContent);
}

console.log('Features updated successfully.');
