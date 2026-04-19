// إعدادات Firebase (Firestore Version)
const firebaseConfig = {
  apiKey: "AIzaSyD5wy1MsBfdYtOewIUwmIehPtzJt44hbzM",
  authDomain: "porto-ec430.firebaseapp.com",
  projectId: "porto-ec430",
  storageBucket: "porto-ec430.firebasestorage.app",
  messagingSenderId: "261983844450",
  appId: "1:261983844450:web:347b4e7828e75e95e5393b",
  measurementId: "G-NMHB3X66ZK"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// مراجع DOM
const els = {
    loading: document.getElementById('loadingState'),
    content: document.getElementById('dashboardContent'),
    lastSync: document.getElementById('lastSync'),
    todayRevenue: document.getElementById('todayRevenue'),
    todayExpenses: document.getElementById('todayExpenses'),
    todayInvoices: document.getElementById('todayInvoices'),
    shiftStatus: document.getElementById('shiftStatus'),
    shiftCashier: document.getElementById('shiftCashier'),
    recentSalesTable: document.getElementById('recentSalesTable'),
    shiftsHistoryTable: document.getElementById('shiftsHistoryTable'),
    detailedLogsTable: document.getElementById('detailedLogsTable'),
    employeesTableOnline: document.getElementById('employeesTableOnline'),
    dateFilter: document.getElementById('dateFilter')
};

let cachedData = null;
let currentFilterDate = new Date().toISOString().split('T')[0];

// تهيئة فلتر التاريخ
els.dateFilter.value = currentFilterDate;
els.dateFilter.addEventListener('change', (e) => {
    currentFilterDate = e.target.value;
    if (cachedData) updateDashboardUI(cachedData);
});

window.resetToToday = function() {
    const today = new Date().toISOString().split('T')[0];
    currentFilterDate = today;
    els.dateFilter.value = today;
    if (cachedData) updateDashboardUI(cachedData);
};

let salesChartInst = null;
let productsChartInst = null;

// تبديل التبويبات
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'border-b-2', 'border-brand-red', 'text-slate-800');
        btn.classList.add('text-slate-500');
    });

    document.getElementById(tabId + 'Tab').classList.remove('hidden');
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    activeBtn.classList.add('active', 'border-b-2', 'border-brand-red', 'text-slate-800');
    activeBtn.classList.remove('text-slate-500');
};

// الاستماع للبيانات من Firestore (Real-time updates)
function listenToData() {
    db.collection('pos_data').onSnapshot((snapshot) => {
        const data = {};
        snapshot.forEach(doc => {
            data[doc.id] = doc.data().items;
        });

        if (Object.keys(data).length > 0) {
            cachedData = data;
            updateDashboardUI(data);
            updateOnlineOrderingUI(data);
            updateOnlineExpensesUI(data);
        } else {
            els.loading.innerHTML = '<div class="loader mb-4"></div><p class="text-orange-500 font-semibold">جاري انتظار أول مزامنة بيانات من الكاشير...</p>';
        }
    }, (error) => {
        console.error("Firestore Error: ", error);
        els.loading.innerHTML = `<i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i><p class="text-red-500 font-bold">خطأ في الاتصال: ${error.message}</p>`;
    });
}

function updateDashboardUI(data) {
    els.loading.classList.add('hidden');
    els.content.classList.remove('hidden');
    
    const now = new Date();
    els.lastSync.textContent = `آخر تحديث: ${now.toLocaleTimeString('ar-EG')}`;
    
    // استخدام تنسيق ISO للمقارنة لتجنب مشاكل timezone
    const filterDateISO = currentFilterDate;
    
    const sales = data.sales || [];
    const expenses = data.expenses || [];
    const shiftsData = data.shifts || { active: null, history: [] };
    const shiftHistory = shiftsData.history || [];
    
    // دالة مساعدة لاستخراج تاريخ ISO من timestamp
    const getISODate = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toISOString().split('T')[0];
    };
    
    // 1. حساب إحصائيات اليوم المختار
    let totalRev = 0;
    let totalInv = 0;
    sales.forEach(sale => {
        const saleDateISO = getISODate(sale.timestamp || sale.date);
        if (saleDateISO === filterDateISO) {
            totalRev += parseFloat(sale.total) || 0;
            totalInv++;
        }
    });
    
    els.todayRevenue.textContent = `${totalRev.toFixed(2)} ج.م`;
    els.todayInvoices.textContent = totalInv;

    let totalExp = 0;
    expenses.forEach(exp => {
        const expDateISO = getISODate(exp.timestamp || exp.date);
        if (expDateISO === filterDateISO) {
            totalExp += parseFloat(exp.amount) || 0;
        }
    });
    els.todayExpenses.textContent = `${totalExp.toFixed(2)} ج.م`;

    // 2. تحديث حالة الشفت النشط
    if (shiftsData.active) {
        els.shiftStatus.textContent = 'مفتوح ونشط';
        els.shiftStatus.className = 'text-xl font-bold text-emerald-600 mt-2';
        els.shiftCashier.textContent = `الكاشير: ${shiftsData.active.cashier || 'غير معروف'}`;
    } else {
        els.shiftStatus.textContent = 'مغلق';
        els.shiftStatus.className = 'text-xl font-bold text-slate-800 mt-2';
        els.shiftCashier.textContent = '-';
    }

    // 3. جدول أحدث المبيعات (نظرة عامة) - نفلترها بناءً على التاريخ المختار
    els.recentSalesTable.innerHTML = '';
    const filteredRecentSales = sales.filter(sale => {
        const saleDateISO = getISODate(sale.timestamp || sale.date);
        return saleDateISO === filterDateISO;
    });

    [...filteredRecentSales].slice(-10).reverse().forEach(sale => {
        const items = sale.items ? sale.items.map(i => `${i.name} (${i.quantity})`).join(', ') : '-';
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        
        let amountDisplay = '';
        if (sale.appliedDiscount && sale.appliedDiscount > 0) {
            const originalTotal = parseFloat(sale.originalTotal || 0);
            const total = parseFloat(sale.total || 0);
            const discountAmount = originalTotal - total;
            amountDisplay = `
                <div class="text-xs text-slate-400 line-through">${originalTotal.toFixed(2)} ج.م</div>
                <div class="text-xs text-red-500">خصم ${sale.appliedDiscount}%: -${discountAmount.toFixed(2)} ج.م</div>
                <div class="font-bold text-brand-red">${total.toFixed(2)} ج.م</div>
            `;
        } else {
            amountDisplay = `<div class="font-bold text-brand-red">${parseFloat(sale.total || 0).toFixed(2)} ج.م</div>`;
        }
        
        tr.innerHTML = `
            <td class="py-3 px-6 border-b border-slate-50 font-semibold">#${sale.receiptNumber}</td>
            <td class="py-3 px-6 border-b border-slate-50 text-slate-500">${new Date(sale.timestamp || sale.date).toLocaleTimeString('ar-EG')}</td>
            <td class="py-3 px-6 border-b border-slate-50 text-xs truncate max-w-[200px]">${items}</td>
            <td class="py-3 px-6 border-b border-slate-50">${amountDisplay}</td>
            <td class="py-3 px-6 border-b border-slate-50"><span class="bg-slate-100 text-slate-600 py-1 px-2 rounded text-xs">${sale.account || 'كاشير'}</span></td>
        `;
        els.recentSalesTable.appendChild(tr);
    });

    // 4. جدول سجل الشفتات (تبويب الشفتات)
    els.shiftsHistoryTable.innerHTML = '';
    [...shiftHistory].reverse().forEach(shift => {
        const diff = shift.reconciliation ? shift.reconciliation.difference : 0;
        const diffClass = diff < 0 ? 'text-red-600' : (diff > 0 ? 'text-emerald-600' : 'text-slate-400');
        
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="py-4 px-6 border-b border-slate-50 font-bold text-slate-600">${shift.id.split('_').pop()}</td>
            <td class="py-4 px-6 border-b border-slate-50">${shift.cashier}</td>
            <td class="py-4 px-6 border-b border-slate-50 text-xs">
                <div>بدء: ${new Date(shift.startTime).toLocaleString('ar-EG')}</div>
                <div class="text-slate-400">انتهاء: ${shift.endTime ? new Date(shift.endTime).toLocaleString('ar-EG') : 'نشط'}</div>
            </td>
            <td class="py-4 px-6 border-b border-slate-50">
                <div class="text-xs text-slate-400">العهدة: ${parseFloat(shift.startingCash || 0).toFixed(2)}</div>
                <div class="font-bold">المبيعات: ${parseFloat(shift.totalRevenue || 0).toFixed(2)}</div>
            </td>
            <td class="py-4 px-6 border-b border-slate-50">
                <div class="font-bold text-slate-800">${parseFloat(shift.netProfit || 0).toFixed(2)} ج</div>
                <div class="text-xs ${diffClass}">الفرق: ${diff.toFixed(2)}</div>
            </td>
            <td class="py-4 px-6 border-b border-slate-50 text-center">
                <button onclick="deleteShiftOnline('${shift.id}')" class="text-red-500 hover:text-red-700 transition" title="حذف الشفت">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        els.shiftsHistoryTable.appendChild(tr);
    });

    // 5. جدول التقارير المفصلة (تبويب التقارير) - نفلترها أيضاً بناءً على التاريخ المختار
    els.detailedLogsTable.innerHTML = '';
    const allLogs = [
        ...sales.map(s => ({...s, logType: 'sale'})), 
        ...expenses.map(e => ({...e, logType: 'expense'}))
    ];
    
    const filteredLogs = allLogs.filter(log => {
        const logDateISO = getISODate(log.timestamp || log.date);
        return logDateISO === filterDateISO;
    });

    filteredLogs.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

    filteredLogs.forEach(log => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        const isSale = log.logType === 'sale';
        
        let amountDisplay = '';
        if (isSale) {
            if (log.appliedDiscount && log.appliedDiscount > 0) {
                const originalTotal = parseFloat(log.originalTotal || 0);
                const total = parseFloat(log.total || 0);
                const discountAmount = originalTotal - total;
                amountDisplay = `
                    <div class="text-xs text-slate-400 line-through">${originalTotal.toFixed(2)} ج.م</div>
                    <div class="text-xs text-red-500">خصم ${log.appliedDiscount}%: -${discountAmount.toFixed(2)} ج.م</div>
                    <div class="font-bold text-emerald-600">${total.toFixed(2)} ج.م</div>
                `;
            } else {
                amountDisplay = `<div class="font-bold text-emerald-600">${parseFloat(log.total || 0).toFixed(2)} ج.م</div>`;
            }
        } else {
            amountDisplay = `<div class="font-bold text-red-600">${parseFloat(log.amount || 0).toFixed(2)} ج.م</div>`;
        }
        
        tr.innerHTML = `
            <td class="py-3 px-6 border-b border-slate-50">
                <span class="px-2 py-1 rounded text-[10px] font-bold ${isSale ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">
                    ${isSale ? 'مبيعات' : 'مصروفات'}
                </span>
            </td>
            <td class="py-3 px-6 border-b border-slate-50 text-xs text-slate-500">${new Date(log.timestamp || log.date).toLocaleString('ar-EG')}</td>
            <td class="py-3 px-6 border-b border-slate-50 max-w-[250px] truncate text-xs">
                ${isSale ? (log.items ? log.items.map(i => i.name).join(', ') : 'فاتورة') : log.description}
            </td>
            <td class="py-3 px-6 border-b border-slate-50">${amountDisplay}</td>
            <td class="py-3 px-6 border-b border-slate-50 text-xs">${isSale ? (log.account || 'كاشير') : (log.user || 'مدير')}</td>
            <td class="py-3 px-6 border-b border-slate-50 text-center">
                <button onclick="deleteLogOnline('${log.logType}', '${log.id || log.receiptNumber}')" class="text-red-500 hover:text-red-700 transition p-2">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        els.detailedLogsTable.appendChild(tr);
    });

    // 6. عرض الموظفين
    if (data.employees) {
        updateEmployeesUI(data.employees);
    }

    updateCharts(sales, filterDateISO);
}

function updateEmployeesUI(employees) {
    if (!els.employeesTableOnline) return;
    els.employeesTableOnline.innerHTML = '';
    
    employees.forEach(emp => {
        const net = (emp.totalEarnings || 0) - (emp.totalWithdrawn || 0);
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="py-4 px-6 border-b border-slate-50 font-bold">${emp.name}</td>
            <td class="py-4 px-6 border-b border-slate-50">${(emp.hourlyRate || 0).toFixed(2)} ج/س</td>
            <td class="py-4 px-6 border-b border-slate-50">${(emp.totalHours || 0).toFixed(1)}</td>
            <td class="py-4 px-6 border-b border-slate-50 text-emerald-600 font-bold">${(emp.totalEarnings || 0).toFixed(2)}</td>
            <td class="py-4 px-6 border-b border-slate-50 text-red-500">${(emp.totalWithdrawn || 0).toFixed(2)}</td>
            <td class="py-4 px-6 border-b border-slate-50 font-black text-slate-800 bg-slate-50/50">${net.toFixed(2)} ج.م</td>
            <td class="py-4 px-6 border-b border-slate-50 text-center">
                <div class="flex gap-2 justify-center">
                    <button onclick="logHoursOnline(${emp.id})" class="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 shadow-sm" title="ساعات">
                        <i class="fas fa-clock text-xs"></i>
                    </button>
                    <button onclick="logWithdrawalOnline(${emp.id})" class="bg-orange-500 text-white p-2 rounded hover:bg-orange-600 shadow-sm" title="سلفة">
                        <i class="fas fa-money-bill-wave text-xs"></i>
                    </button>
                    <button onclick="settleAccountOnline(${emp.id})" class="bg-emerald-500 text-white p-2 rounded hover:bg-emerald-600 shadow-sm" title="تصفير">
                        <i class="fas fa-check-double text-xs"></i>
                    </button>
                    <button onclick="deleteEmployeeOnline(${emp.id})" class="bg-slate-200 text-slate-600 p-2 rounded hover:bg-red-500 hover:text-white transition" title="حذف">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            </td>
        `;
        els.employeesTableOnline.appendChild(tr);
    });
}

window.deleteLogOnline = function(type, id) {
    if (!confirm('هل أنت متأكد من مسح هذا التقرير من النظام نهائياً؟')) return;
    
    const collectionName = type === 'sale' ? 'sales' : 'expenses';
    const fieldName = type === 'sale' ? 'receiptNumber' : 'id';
    
    const newData = cachedData[collectionName].filter(item => item[fieldName].toString() !== id.toString());
    
    db.collection('pos_data').doc(collectionName).update({
        items: newData
    }).then(() => {
        alert('تم المسح بنجاح من النظام السحابي');
    }).catch(err => {
        console.error("Error deleting log: ", err);
        alert('حدث خطأ أثناء المسح');
    });
};

window.clearAllLogsOnline = function() {
    if (!confirm('تحذير: هل أنت متأكد من مسح جميع التقارير (المبيعات والمصاريف) نهائياً من النظام؟\nهذا الإجراء لا يمكن التراجع عنه!')) return;
    
    const p1 = db.collection('pos_data').doc('sales').update({ items: [] });
    const p2 = db.collection('pos_data').doc('expenses').update({ items: [] });
    
    Promise.all([p1, p2]).then(() => {
        alert('تم مسح جميع التقارير بنجاح');
    }).catch(err => {
        console.error("Error clearing logs: ", err);
        alert('حدث خطأ أثناء محاولة المسح');
    });
};

window.addEmployeeOnline = function() {
    const name = document.getElementById('employeeNameInput').value;
    const rate = parseFloat(document.getElementById('hourlyRateInput').value);
    
    if (!name || isNaN(rate)) return alert('يرجى إدخال بيانات صحيحة');
    
    const employees = cachedData.employees || [];
    const newId = employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 1;
    
    const newEmployee = {
        id: newId,
        name: name,
        hourlyRate: rate,
        totalHours: 0,
        currentDayHours: 0,
        totalEarnings: 0,
        totalWithdrawn: 0,
        history: [],
        registrationDate: new Date().toLocaleDateString('ar-EG')
    };
    
    employees.push(newEmployee);
    updateEmployeesCollection(employees);
    
    document.getElementById('employeeNameInput').value = '';
    document.getElementById('hourlyRateInput').value = '';
};

window.logHoursOnline = function(id) {
    const hours = parseFloat(prompt('أدخل عدد الساعات:'));
    if (isNaN(hours) || hours <= 0) return;
    
    const employees = [...cachedData.employees];
    const emp = employees.find(e => e.id === id);
    if (emp) {
        emp.totalHours = (emp.totalHours || 0) + hours;
        emp.totalEarnings = (emp.totalEarnings || 0) + (hours * emp.hourlyRate);
        updateEmployeesCollection(employees);
    }
};

window.logWithdrawalOnline = function(id) {
    const amount = parseFloat(prompt('أدخل مبلغ المسحوبات:'));
    if (isNaN(amount) || amount <= 0) return;
    
    const employees = [...cachedData.employees];
    const emp = employees.find(e => e.id === id);
    if (emp) {
        emp.totalWithdrawn = (emp.totalWithdrawn || 0) + amount;
        updateEmployeesCollection(employees);
    }
};

window.settleAccountOnline = function(id) {
    const employees = [...cachedData.employees];
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    
    const net = (emp.totalEarnings || 0) - (emp.totalWithdrawn || 0);
    if (net <= 0) return alert('لا يوجد مستحقات حالياً');
    
    if (confirm(`هل أنت متأكد من تصفير حساب ${emp.name} بمبلغ ${net.toFixed(2)} ج.م؟`)) {
        emp.totalHours = 0;
        emp.totalEarnings = 0;
        emp.totalWithdrawn = 0;
        updateEmployeesCollection(employees);
    }
};

window.deleteEmployeeOnline = function(id) {
    if (!confirm('هل أنت متأكد من حذف الموظف نهائياً؟')) return;
    const employees = cachedData.employees.filter(e => e.id !== id);
    updateEmployeesCollection(employees);
};

function updateEmployeesCollection(employees) {
    db.collection('pos_data').doc('employees').update({
        items: employees
    }).then(() => {
        alert('تم تحديث بيانات الموظفين بنجاح');
    }).catch(err => {
        console.error("Error updating employees: ", err);
        alert('حدث خطأ أثناء التحديث');
    });
}

function updateCharts(sales, targetDateObj) {
    const last7Days = {};
    for (let i=6; i>=0; i--) {
        const d = new Date(targetDateObj);
        d.setDate(d.getDate() - i);
        last7Days[d.toLocaleDateString('ar-EG')] = 0;
    }

    const productsCount = {};
    sales.forEach(sale => {
        const dateStr = new Date(sale.timestamp || sale.date).toLocaleDateString('ar-EG');
        if (last7Days[dateStr] !== undefined) last7Days[dateStr] += parseFloat(sale.total) || 0;
        if (sale.items) {
            sale.items.forEach(item => {
                productsCount[item.name] = (productsCount[item.name] || 0) + (parseInt(item.quantity) || 1);
            });
        }
    });

    // Chart Sales
    const ctxS = document.getElementById('salesChart').getContext('2d');
    if (salesChartInst) salesChartInst.destroy();
    salesChartInst = new Chart(ctxS, {
        type: 'line',
        data: {
            labels: Object.keys(last7Days),
            datasets: [{ label: 'مبيعات (ج.م)', data: Object.values(last7Days), borderColor: '#ef4444', tension: 0.4, fill: true, backgroundColor: 'rgba(239, 68, 68, 0.1)' }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
        }
    });

    // Chart Products
    const top5 = Object.entries(productsCount).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const ctxP = document.getElementById('productsChart').getContext('2d');
    if (productsChartInst) productsChartInst.destroy();
    productsChartInst = new Chart(ctxP, {
        type: 'doughnut',
        data: { labels: top5.map(p => p[0]), datasets: [{ data: top5.map(p => p[1]), backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Cairo', size: 11 } } } }, cutout: '70%' }
    });
}

// دالة حذف شفت واحد أونلاين
window.deleteShiftOnline = async function(shiftId) {
    if (!confirm('هل أنت متأكد من حذف هذا الشفت نهائياً من النظام؟')) return;
    
    try {
        const shiftsData = cachedData.shifts || { active: null, history: [] };
        const originalHistory = shiftsData.history || [];
        
        // تصفية التاريخ لحذف الشفت المطلوب
        const updatedHistory = originalHistory.filter(s => s.id !== shiftId);
        
        if (originalHistory.length === updatedHistory.length) {
            alert('لم يتم العثور على الشفت المطلوب أو أنه الشفت النشط حالياً');
            return;
        }

        db.collection('pos_data').doc('shifts').update({
            items: {
                ...shiftsData,
                history: updatedHistory
            }
        }).then(() => {
            alert('تم حذف الشفت بنجاح وسيتم تحديث البيانات');
        });
    } catch (error) {
        console.error("Error deleting shift:", error);
        alert('حدث خطأ أثناء الحذف: ' + error.message);
    }
};

// دالة مسح سجل الشفتات بالكامل أونلاين
window.clearShiftsHistoryOnline = async function() {
    if (!confirm('تحذير! سيتم مسح سجل الشفتات بالكامل نهائياً. هل أنت متأكد؟')) return;
    
    try {
        const shiftsData = cachedData.shifts || { active: null, history: [] };
        
        db.collection('pos_data').doc('shifts').update({
            items: {
                active: shiftsData.active, // الحفاظ على الشفت النشط فقط
                history: [] // تصفير السجل
            }
        }).then(() => {
            alert('تم مسح سجل الشفتات بنجاح');
        });
    } catch (error) {
        console.error("Error clearing shifts history:", error);
        alert('حدث خطأ أثناء مسح السجل: ' + error.message);
    }
};

// 7. وظائف الطلب أونلاين
function updateOnlineOrderingUI(data) {
    if (!data.products) return;
    onlineMenu = data.products;
    renderOnlineMenu(onlineMenu);
}

function renderOnlineMenu(products) {
    const grid = document.getElementById('onlineMenuGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    products.forEach(product => {
        const div = document.createElement('div');
        div.className = "bg-white border border-slate-100 p-3 rounded-xl hover:shadow-md transition cursor-pointer group";
        div.onclick = () => addToOnlineCart(product);
        div.innerHTML = `
            <div class="font-bold text-slate-800 text-sm group-hover:text-brand-red transition">${product.name}</div>
            <div class="flex justify-between items-center mt-2">
                <span class="text-brand-red font-black text-xs">${parseFloat(product.price).toFixed(2)} ج</span>
                <button class="bg-slate-100 text-slate-400 group-hover:bg-brand-red group-hover:text-white w-6 h-6 rounded-lg transition">
                    <i class="fas fa-plus text-[10px]"></i>
                </button>
            </div>
        `;
        grid.appendChild(div);
    });
}

window.filterOnlineMenu = function() {
    const term = document.getElementById('menuSearch').value.toLowerCase();
    const filtered = onlineMenu.filter(p => p.name.toLowerCase().includes(term));
    renderOnlineMenu(filtered);
};

let pendingProduct = null; // لتخزين المنتج المعلق

function addToOnlineCart(product) {
    pendingProduct = product;
    showPriceModal(product);
}

function showPriceModal(product) {
    const modal = document.getElementById('priceModal');
    const title = document.getElementById('priceModalTitle');
    const productText = document.getElementById('priceModalProduct');
    const input = document.getElementById('customPriceInput');
    
    title.textContent = 'أنت عايز بكام؟';
    productText.textContent = product.name;
    input.value = product.price.toFixed(2);
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
    input.select();
    
    // إضافة مستمع لزر Enter
    input.onkeydown = (e) => {
        if (e.key === 'Enter') confirmPriceModal();
    };
}

function cancelPriceModal() {
    const modal = document.getElementById('priceModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingProduct = null;
}

function confirmPriceModal() {
    const input = document.getElementById('customPriceInput');
    const price = parseFloat(input.value);
    
    if (isNaN(price) || price <= 0) {
        alert('الرجاء إدخال سعر صحيح');
        return;
    }
    
    if (pendingProduct) {
        const existing = onlineCart.find(item => item.id === pendingProduct.id);
        if (existing) {
            existing.quantity++;
            existing.price = price;
        } else {
            onlineCart.push({ ...pendingProduct, quantity: 1, price: price });
        }
        updateOnlineCartUI();
    }
    
    cancelPriceModal();
}

function updateOnlineCartUI() {
    const container = document.getElementById('onlineCartItems');
    if (!container) return;
    
    if (onlineCart.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-slate-400">
                <i class="fas fa-shopping-basket text-4xl mb-3 opacity-20"></i>
                <p class="text-xs">السلة فارغة حالياً</p>
            </div>
        `;
        document.getElementById('cartTotal').textContent = '0.00 ج.م';
        document.getElementById('cartSubtotal').textContent = '0.00 ج';
        document.getElementById('cartCountBadge').textContent = '0';
        document.getElementById('sendOrderBtn').disabled = true;
        return;
    }

    container.innerHTML = '';
    let total = 0;
    let count = 0;

    onlineCart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        count += item.quantity;
        
        const div = document.createElement('div');
        div.className = "bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between";
        div.innerHTML = `
            <div class="flex-grow">
                <div class="font-bold text-slate-800 text-xs">${item.name}</div>
                <div class="text-[10px] text-slate-400 mt-1">${item.price.toFixed(2)} ج × ${item.quantity}</div>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-100">
                    <button onclick="changeQty(${index}, -1)" class="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-brand-red"><i class="fas fa-minus text-[8px]"></i></button>
                    <span class="w-6 text-center font-bold text-xs text-slate-700">${item.quantity}</span>
                    <button onclick="changeQty(${index}, 1)" class="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-emerald-500"><i class="fas fa-plus text-[8px]"></i></button>
                </div>
                <button onclick="removeFromCart(${index})" class="text-slate-300 hover:text-red-500 transition"><i class="fas fa-times-circle"></i></button>
            </div>
        `;
        container.appendChild(div);
    });

    document.getElementById('cartTotal').textContent = total.toFixed(2) + ' ج.م';
    document.getElementById('cartSubtotal').textContent = total.toFixed(2) + ' ج';
    document.getElementById('cartCountBadge').textContent = count;
    document.getElementById('sendOrderBtn').disabled = false;
}

window.changeQty = function(index, delta) {
    onlineCart[index].quantity += delta;
    if (onlineCart[index].quantity <= 0) {
        onlineCart.splice(index, 1);
    }
    updateOnlineCartUI();
};

window.removeFromCart = function(index) {
    onlineCart.splice(index, 1);
    updateOnlineCartUI();
};

window.sendOrderToPOS = async function() {
    if (onlineCart.length === 0) return;
    
    const btn = document.getElementById('sendOrderBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الإرسال...';

    try {
        const orderData = {
            id: 'ORD_' + Date.now(),
            items: onlineCart,
            total: onlineCart.reduce((sum, i) => sum + (i.price * i.quantity), 0),
            timestamp: new Date().toISOString(),
            status: 'pending',
            source: 'online_dashboard',
            customer: 'طلب أونلاين'
        };

        // إرسال الطلب إلى Firestore
        await db.collection('pos_data').doc('online_orders').set({
            items: firebase.firestore.FieldValue.arrayUnion(orderData),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        alert('تم إرسال الطلب بنجاح! سيظهر جرس تنبيه عند الكاشير.');
        onlineCart = [];
        updateOnlineCartUI();
        switchTab('overview');
    } catch (error) {
        console.error("Error sending order:", error);
        alert('حدث خطأ أثناء إرسال الطلب: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bell animate-bounce ml-2"></i> إرسال الطلب للكاشير';
    }
};

let onlineCart = [];
let onlineMenu = [];
let onlineExpenses = [];

// 8. وظائف إدارة المصاريف أونلاين
function updateOnlineExpensesUI(data) {
    if (!data.expenses) return;
    onlineExpenses = data.expenses;
    renderOnlineExpenses(onlineExpenses);
}

function renderOnlineExpenses(expensesToRender) {
    const tbody = document.getElementById('onlineExpensesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (expensesToRender.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-4 px-6 text-center text-slate-400">لا توجد مصاريف مسجلة</td>
            </tr>
        `;
        return;
    }

    // ترتيب من الأحدث للأقدم
    const sorted = [...expensesToRender].sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));

    sorted.forEach(expense => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="py-3 px-6 border-b border-slate-50 text-xs">${new Date(expense.date || expense.timestamp).toLocaleString('ar-EG')}</td>
            <td class="py-3 px-6 border-b border-slate-50 font-semibold">${expense.name || expense.description}</td>
            <td class="py-3 px-6 border-b border-slate-50 font-bold text-red-600">${parseFloat(expense.amount).toFixed(2)} ج.م</td>
            <td class="py-3 px-6 border-b border-slate-50 text-slate-500">${expense.category || 'عام'}</td>
            <td class="py-3 px-6 border-b border-slate-50 text-slate-500">${expense.user || 'مدير'}</td>
            <td class="py-3 px-6 border-b border-slate-50 text-xs truncate max-w-[150px]">${expense.notes || '-'}</td>
            <td class="py-3 px-6 border-b border-slate-50 text-center">
                <button onclick="deleteOnlineExpense('${expense.id}')" class="text-red-500 hover:text-red-700 transition p-2">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.filterOnlineExpenses = function() {
    const term = document.getElementById('expensesSearchOnline').value.toLowerCase();
    const filtered = onlineExpenses.filter(exp => 
        (exp.name || exp.description || '').toLowerCase().includes(term) || 
        (exp.notes || '').toLowerCase().includes(term) ||
        (exp.category || '').toLowerCase().includes(term)
    );
    renderOnlineExpenses(filtered);
};

window.deleteOnlineExpense = async function(expenseId) {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف نهائياً؟')) return;
    
    try {
        const docRef = db.collection('pos_data').doc('expenses');
        const doc = await docRef.get();
        
        if (doc.exists) {
            const currentExpenses = doc.data().items || [];
            const updatedExpenses = currentExpenses.filter(exp => exp.id.toString() !== expenseId.toString());
            
            await docRef.update({ items: updatedExpenses });
            alert('تم حذف المصروف بنجاح من النظام السحابي وسيتم تحديث الكاشير');
        }
    } catch (error) {
        console.error("Error deleting expense:", error);
        alert('حدث خطأ أثناء الحذف: ' + error.message);
    }
};

window.clearAllExpensesOnline = async function() {
    if (!confirm('تحذير! سيتم مسح كافة المصاريف نهائياً من النظام. هل أنت متأكد؟')) return;
    
    try {
        await db.collection('pos_data').doc('expenses').update({ items: [] });
        alert('تم مسح كافة المصاريف بنجاح');
    } catch (error) {
        console.error("Error clearing all expenses:", error);
        alert('حدث خطأ أثناء مسح المصاريف: ' + error.message);
    }
};

listenToData();
