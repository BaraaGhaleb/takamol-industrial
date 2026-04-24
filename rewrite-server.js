const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

// Replace the dashboard and endpoints
const regex = /\/\/ Simple Admin Endpoint to view submissions(?:[\s\S]*)\/\/ Start the server/g;

const newCode = `// API Endpoint to get all submissions
app.get('/api/admin/submissions', (req, res) => {
    db.all(\`SELECT * FROM submissions ORDER BY created_at DESC\`, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        let html = \`
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Admin Dashboard - Takamol Submissions</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
            <script src="https://unpkg.com/lucide@latest"></script>
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">
            <style> body { font-family: 'Tajawal', sans-serif; } </style>
        </head>
        <body class="bg-gray-50 p-8" dir="rtl">
            <div id="app" class="max-w-7xl mx-auto">
                <div class="flex justify-between items-center mb-8">
                    <h2 class="text-3xl font-black text-gray-800">لوحة تحكم المشرف - طلبات الموقع</h2>
                </div>

                <!-- Filters & Search -->
                <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 mb-6">
                    <div class="flex-1 min-w-[250px] relative">
                        <input v-model="searchQuery" type="text" placeholder="بحث بالاسم، الشركة، الجوال، البريد..." class="w-full border border-gray-200 rounded-lg pr-10 pl-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        <i data-lucide="search" class="w-5 h-5 absolute right-3 top-3.5 text-gray-400"></i>
                    </div>
                    <select v-model="statusFilter" class="border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 bg-gray-50">
                        <option value="all">كل الحالات</option>
                        <option value="pending">قيد الانتظار</option>
                        <option value="done">منجز</option>
                    </select>
                    <select v-model="typeFilter" class="border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 bg-gray-50">
                        <option value="all">كل النماذج</option>
                        <option value="general">عام</option>
                        <option value="consulting">استشارات</option>
                        <option value="maintenance">صيانة وتشغيل</option>
                        <option value="supply">توريدات</option>
                    </select>
                </div>

                <!-- Data Table -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table class="w-full text-right text-sm">
                        <thead class="bg-gray-900 text-white">
                            <tr>
                                <th class="p-4 w-1/4">المستخدم</th>
                                <th class="p-4 w-1/4">معلومات الاتصال</th>
                                <th class="p-4 w-1/4">الطلبات</th>
                                <th class="p-4 w-1/4"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            <template v-for="group in filteredGroups" :key="group.email || group.phone">
                                <!-- Group Header -->
                                <tr class="hover:bg-gray-50 transition-colors">
                                    <td class="p-4 align-top border-l border-gray-100">
                                        <div class="font-bold text-gray-900 text-lg mb-1">{{ group.name || 'غير محدد' }}</div>
                                        <div class="text-gray-500 flex items-center gap-1"><i data-lucide="building-2" class="w-4 h-4"></i> {{ group.company || 'لا توجد شركة' }}</div>
                                    </td>
                                    <td class="p-4 align-top text-gray-600 border-l border-gray-100">
                                        <div dir="ltr" class="text-right font-medium text-gray-800 flex justify-end items-center gap-1 mb-1">{{ group.phone }} <i data-lucide="phone" class="w-4 h-4"></i></div>
                                        <div class="flex items-center gap-1"><i data-lucide="mail" class="w-4 h-4"></i> {{ group.email || 'لا يوجد بريد' }}</div>
                                    </td>
                                    <td class="p-4 align-middle">
                                        <button @click="group.expanded = !group.expanded" class="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 font-bold bg-blue-50 px-4 py-2 rounded-full transition-colors border border-blue-200">
                                            {{ group.requests.length }} طلبات
                                            <i :data-lucide="group.expanded ? 'chevron-up' : 'chevron-down'" class="w-4 h-4"></i>
                                        </button>
                                    </td>
                                    <td class="p-4 align-top"></td>
                                </tr>
                                <!-- Requests (Expanded) -->
                                <tr v-if="group.expanded" v-for="r in group.requests" :key="r.id" :class="{'bg-gray-50 opacity-60': r.status === 'done'}">
                                    <td colspan="4" class="p-0 border-t-0">
                                        <div class="pr-8 pl-4 py-4 bg-gray-50/50 flex gap-6 items-start border-b border-gray-100 last:border-0 shadow-inner">
                                            <div class="w-24 shrink-0 mt-1">
                                                <span v-if="r.status === 'done'" class="bg-gray-500 text-white text-xs px-3 py-1 rounded-full font-bold">منجز</span>
                                                <span v-else class="bg-yellow-500 text-white text-xs px-3 py-1 rounded-full font-bold shadow-sm">قيد الانتظار</span>
                                            </div>
                                            <div class="w-32 shrink-0">
                                                <div class="font-bold text-gray-800 mb-1">{{ r.form_type }}</div>
                                                <div class="text-xs text-gray-500">{{ new Date(r.created_at).toLocaleString('ar-SA') }}</div>
                                            </div>
                                            <div class="w-40 shrink-0 text-gray-700 font-medium">
                                                <span class="bg-white border border-gray-200 px-2 py-1 rounded text-xs">{{ r.category }}</span>
                                            </div>
                                            <div class="flex-1 text-gray-800 bg-white p-3 rounded-lg border border-gray-200 leading-relaxed text-sm">
                                                {{ r.message }}
                                            </div>
                                            <div class="flex flex-col gap-2 shrink-0 ml-4">
                                                <button v-if="r.status !== 'done'" @click="markDone(r.id)" class="flex items-center gap-1 text-green-700 hover:text-white hover:bg-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-md text-sm font-bold transition-colors">
                                                    <i data-lucide="check" class="w-4 h-4"></i> إنجاز
                                                </button>
                                                <button @click="deleteReq(r.id)" class="flex items-center gap-1 text-red-700 hover:text-white hover:bg-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-md text-sm font-bold transition-colors">
                                                    <i data-lucide="trash-2" class="w-4 h-4"></i> حذف
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                            <tr v-if="filteredGroups.length === 0">
                                <td colspan="4" class="p-12 text-center text-gray-500">
                                    <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-4 opacity-50"></i>
                                    <span class="text-lg">لا توجد طلبات مطابقة للبحث</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <script>
                const { createApp } = Vue;
                const rawData = \`\${JSON.stringify(rows).replace(/</g, '\\\\u003c')}\`;
                
                createApp({
                    data() {
                        return {
                            requests: JSON.parse(rawData),
                            searchQuery: '',
                            statusFilter: 'all',
                            typeFilter: 'all'
                        }
                    },
                    computed: {
                        filteredRequests() {
                            return this.requests.filter(r => {
                                const matchSearch = !this.searchQuery || 
                                    (r.name || '').includes(this.searchQuery) || 
                                    (r.company || '').includes(this.searchQuery) || 
                                    (r.phone || '').includes(this.searchQuery) || 
                                    (r.email || '').includes(this.searchQuery);
                                
                                const matchStatus = this.statusFilter === 'all' || r.status === this.statusFilter;
                                const matchType = this.typeFilter === 'all' || r.form_type === this.typeFilter;
                                
                                return matchSearch && matchStatus && matchType;
                            });
                        },
                        filteredGroups() {
                            // Group by email (or phone if email is empty)
                            const groups = {};
                            this.filteredRequests.forEach(r => {
                                const key = r.email || r.phone || ('anon_'+r.id);
                                if(!groups[key]) {
                                    groups[key] = {
                                        email: r.email,
                                        phone: r.phone,
                                        name: r.name,
                                        company: r.company,
                                        requests: [],
                                        expanded: false
                                    };
                                }
                                groups[key].requests.push(r);
                            });
                            
                            // Convert to array and sort by latest request inside group
                            return Object.values(groups).sort((a,b) => {
                                const latestA = Math.max(...a.requests.map(r => new Date(r.created_at).getTime()));
                                const latestB = Math.max(...b.requests.map(r => new Date(r.created_at).getTime()));
                                return latestB - latestA;
                            }).map(g => {
                                if(g.requests.length === 1 || this.searchQuery) g.expanded = true; 
                                return g;
                            });
                        }
                    },
                    methods: {
                        async markDone(id) {
                            if(!confirm('هل أنت متأكد من إنجاز هذا الطلب؟')) return;
                            try {
                                const res = await fetch('/api/admin/submissions/' + id + '/done', { method: 'POST' });
                                if(res.ok) window.location.reload();
                            } catch(e) { alert(e); }
                        },
                        async deleteReq(id) {
                            if(!confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
                            try {
                                const res = await fetch('/api/admin/submissions/' + id, { method: 'DELETE' });
                                if(res.ok) window.location.reload();
                            } catch(e) { alert(e); }
                        }
                    },
                    mounted() {
                        setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 100);
                    },
                    updated() {
                        setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 10);
                    }
                }).mount('#app');
            </script>
        </body>
        </html>\`;
        res.send(html);
    });
});

// API Endpoint to mark submission as done
app.post('/api/admin/submissions/:id/done', (req, res) => {
    const id = req.params.id;
    db.run("UPDATE submissions SET status = 'done' WHERE id = ?", [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.status(200).json({ success: true });
        }
    });
});

// API Endpoint to delete submission
app.delete('/api/admin/submissions/:id', (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM submissions WHERE id = ?", [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.status(200).json({ success: true });
        }
    });
});

// Start the server`;

serverCode = serverCode.replace(regex, newCode);
fs.writeFileSync('server.js', serverCode);
console.log('Server updated');
