lucide.createIcons();

const API_BASE = '/api';
let isSidebarOpen = false;
let products = [];
let categories = [];
let suppliers = [];
let employees = [];
let salesTrendChartInstance = null;
let topProductsChartInstance = null;
let paymentModeChartInstance = null;
let hourlySalesChartInstance = null;
let isWizardSaving = false;

// Wizard State
let wizardState = {
    step: 1,
    photoFile: null,
    photoBase64: null,
    uploadedUrl: null
};

const formatINR = (val) => '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function setSyncStatus(status) {
    const badge = document.getElementById('syncStatusBadge');
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncStatusText');
    if (!badge || !dot || !text) return;

    if (status === 'synced') {
        badge.className = "flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30";
        dot.className = "w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse";
        text.textContent = "Live Sync";
    } else if (status === 'syncing') {
        badge.className = "flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30";
        dot.className = "w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-ping";
        text.textContent = "Syncing...";
    } else {
        badge.className = "flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30";
        dot.className = "w-1.5 h-1.5 rounded-full bg-[#EF4444]";
        text.textContent = "Offline";
    }
}

async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('dd_token') || 'master_token';
    setSyncStatus('syncing');
    try {
        const res = await fetch(API_BASE + path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            }
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
            setSyncStatus('offline');
            throw new Error(data?.error || 'Server error');
        }

        setSyncStatus('synced');
        return data;
    } catch (e) {
        setSyncStatus('offline');
        throw e;
    }
}

function showToast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `fixed bottom-5 right-5 z-[9999] px-4 py-3 rounded-2xl text-xs font-bold shadow-2xl border ${
        isError ? 'bg-[#EF4444] text-white border-[#EF4444]' : 'bg-[#171A21] text-[#F8FAFC] border-[#2A2F3A]'
    }`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function checkAuth() {
    localStorage.setItem('dd_token', 'master_token');
    localStorage.setItem('dd_name', 'Store Admin');
    localStorage.setItem('dd_role', 'MANAGER');
    const nameEl = document.getElementById('sidebarUserName');
    if (nameEl) nameEl.textContent = 'Store Admin';
    refreshData();
}

function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (isSidebarOpen) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetTab = document.getElementById(`${tabId}-tab`);
    const targetNav = document.getElementById(`nav-${tabId}`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    const titles = {
        dashboard: "Dashboard Overview",
        stock: "Stock & Product Inventory",
        staff: "Staff Management & Leaves",
        reports: "Sales Reports & Logs",
        settings: "Store Settings & Master Lists"
    };
    document.getElementById('pageTitle').textContent = titles[tabId] || "Admin Dashboard";

    if (window.innerWidth < 768 && isSidebarOpen) toggleSidebar();
    if (tabId === 'reports') loadSalesReport();
}

async function refreshData() {
    try {
        const [prodsData, catsData, suppsData, empsData, summaryData, chartsData] = await Promise.all([
            apiFetch('/products').catch(() => []),
            apiFetch('/categories').catch(() => []),
            apiFetch('/suppliers').catch(() => []),
            apiFetch('/employees').catch(() => []),
            apiFetch('/sales/summary').catch(() => ({ todayRevenue: 0, totalRevenue: 0, lowStockCount: 0 })),
            apiFetch('/analytics/charts').catch(() => ({ trend: [], topProducts: [], paymentModes: [], hourlySales: [], financials: {} }))
        ]);

        products = prodsData || [];
        categories = catsData || [];
        suppliers = suppsData || [];
        employees = empsData || [];

        document.getElementById('metricTodayRev').textContent = formatINR(summaryData.todayRevenue);
        document.getElementById('metricTotalRev').textContent = formatINR(summaryData.totalRevenue);
        document.getElementById('metricLowStock').textContent = summaryData.lowStockCount || 0;

        // Financials summary
        const fin = chartsData?.financials || {};
        if (document.getElementById('finGrossRev')) document.getElementById('finGrossRev').textContent = formatINR(fin.totalRev);
        if (document.getElementById('finGst')) document.getElementById('finGst').textContent = formatINR(fin.estimatedGst);
        if (document.getElementById('finNetProfit')) document.getElementById('finNetProfit').textContent = formatINR(fin.totalProfit);
        if (document.getElementById('finMargin')) document.getElementById('finMargin').textContent = `${fin.profitMargin || 0}%`;

        renderStockTable();
        renderEmployees();
        renderCategories();
        renderCharts(chartsData);
        populateWizardCategories();
    } catch (err) {
        showToast(err.message, true);
    }
}

function populateWizardCategories() {
    const wizSelect = document.getElementById('wiz-category');
    if (wizSelect && categories.length > 0) {
        wizSelect.innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
}

function renderCharts(chartsData) {
    const trendData = chartsData?.trend || [];
    const topData = chartsData?.topProducts || [];
    const pmData = chartsData?.paymentModes || [];
    const hourlyData = chartsData?.hourlySales || [];

    // 1. Revenue Trend Line Chart
    const trendLabels = trendData.map(d => d.date);
    const trendTotals = trendData.map(d => parseFloat(d.total));

    const ctxTrend = document.getElementById('salesTrendChart')?.getContext('2d');
    if (ctxTrend) {
        if (salesTrendChartInstance) {
            salesTrendChartInstance.data.labels = trendLabels;
            salesTrendChartInstance.data.datasets[0].data = trendTotals;
            salesTrendChartInstance.update('none');
        } else {
            salesTrendChartInstance = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: trendLabels,
                    datasets: [{
                        label: 'Revenue (₹)',
                        data: trendTotals,
                        borderColor: '#5B8CFF',
                        backgroundColor: 'rgba(91, 140, 255, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#94A3B8', font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: '#94A3B8', font: { size: 10 } }, grid: { color: '#2A2F3A' } }
                    }
                }
            });
        }
    }

    // 2. Top Selling Products Doughnut Chart
    const ctxTop = document.getElementById('topProductsChart')?.getContext('2d');
    if (ctxTop) {
        const topLabels = topData.map(d => d.product_name);
        const topUnits = topData.map(d => parseInt(d.units_sold, 10));

        if (topProductsChartInstance) {
            topProductsChartInstance.data.labels = topLabels.length ? topLabels : ['No Sales Yet'];
            topProductsChartInstance.data.datasets[0].data = topUnits.length ? topUnits : [1];
            topProductsChartInstance.update('none');
        } else {
            topProductsChartInstance = new Chart(ctxTop, {
                type: 'doughnut',
                data: {
                    labels: topLabels.length ? topLabels : ['No Sales Yet'],
                    datasets: [{
                        data: topUnits.length ? topUnits : [1],
                        backgroundColor: ['#5B8CFF', '#22C55E', '#F59E0B', '#EC4899', '#2A2F3A']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 10 } } } }
                }
            });
        }
    }

    // 3. Preferred Payment Mode (UPI vs Cash vs Card) Chart
    const ctxPm = document.getElementById('paymentModeChart')?.getContext('2d');
    if (ctxPm) {
        const pmLabels = pmData.map(d => d.mode);
        const pmCounts = pmData.map(d => d.count);

        if (paymentModeChartInstance) {
            paymentModeChartInstance.data.labels = pmLabels;
            paymentModeChartInstance.data.datasets[0].data = pmCounts;
            paymentModeChartInstance.update('none');
        } else {
            paymentModeChartInstance = new Chart(ctxPm, {
                type: 'doughnut',
                data: {
                    labels: pmLabels.length ? pmLabels : ['UPI', 'CASH', 'CARD'],
                    datasets: [{
                        data: pmCounts.length ? pmCounts : [1, 0, 0],
                        backgroundColor: ['#EC4899', '#22C55E', '#5B8CFF']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 10 } } } }
                }
            });
        }
    }

    // 4. Peak Sales Hours Bar Chart
    const ctxHourly = document.getElementById('hourlySalesChart')?.getContext('2d');
    if (ctxHourly) {
        const hourlyLabels = hourlyData.map(d => d.hour);
        const hourlyTotals = hourlyData.map(d => parseFloat(d.total));

        if (hourlySalesChartInstance) {
            hourlySalesChartInstance.data.labels = hourlyLabels;
            hourlySalesChartInstance.data.datasets[0].data = hourlyTotals;
            hourlySalesChartInstance.update('none');
        } else {
            hourlySalesChartInstance = new Chart(ctxHourly, {
                type: 'bar',
                data: {
                    labels: hourlyLabels.length ? hourlyLabels : ["9 AM", "12 PM", "3 PM", "6 PM", "9 PM"],
                    datasets: [{
                        label: 'Sales (₹)',
                        data: hourlyTotals.length ? hourlyTotals : [0, 0, 0, 0, 0],
                        backgroundColor: '#F59E0B',
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#94A3B8', font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: '#94A3B8', font: { size: 10 } }, grid: { color: '#2A2F3A' } }
                    }
                }
            });
        }
    }
}

function renderStockTable() {
    const query = (document.getElementById('stockSearchInput')?.value || '').toLowerCase();
    const body = document.getElementById('stockTableBody');
    if (!body) return;

    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.category && (p.category.name || p.category).toLowerCase().includes(query)) ||
        (p.supplier && (p.supplier.name || p.supplier).toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-[#94A3B8]">No product items found. Click "+ Add Product" to create one.</td></tr>`;
        return;
    }

    body.innerHTML = filtered.map(p => {
        const catName = p.category?.name || p.category || 'General';
        const minStock = p.minStock || 5;
        const photoUrl = p.photoUrl || p.imageUrl;
        return `
            <tr class="hover:bg-[#1E222B]/50 transition-colors">
                <td class="p-3.5 flex items-center gap-3">
                    ${photoUrl ? `<img src="${photoUrl}" class="w-8 h-8 rounded-lg object-cover border border-[#2A2F3A]">` : ''}
                    <button onclick="openStatsModal(${p.id})" class="text-[#F8FAFC] font-extrabold hover:text-[#5B8CFF] text-left">
                        ${p.name}
                    </button>
                </td>
                <td class="p-3.5 text-[#94A3B8]">${catName}</td>
                <td class="p-3.5 text-[#94A3B8]">${formatINR(p.buyPrice)}</td>
                <td class="p-3.5 text-[#5B8CFF] font-bold">${formatINR(p.sellPrice)}</td>
                <td class="p-3.5 text-center">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${p.stock <= minStock ? 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30' : 'bg-[#22C55E]/10 text-[#22C55E]'}">
                        ${p.stock} Units
                    </span>
                </td>
                <td class="p-3.5 text-right space-x-1">
                    <button onclick="openStatsModal(${p.id})" class="p-1.5 bg-[#1E222B] text-[#94A3B8] hover:text-[#F8FAFC] rounded-lg border border-[#2A2F3A]" title="View Photo & Stats">
                        <i data-lucide="info" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="openStatsModal(${p.id})" class="p-1.5 bg-[#1E222B] text-[#5B8CFF] rounded-lg border border-[#2A2F3A]" title="Edit Product">
                        <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="deleteProduct(${p.id})" class="p-1.5 bg-[#1E222B] text-[#EF4444] rounded-lg border border-[#2A2F3A]" title="Delete Product">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    lucide.createIcons();
}

// --- 4-STEP WIZARD ---
function openWizard() {
    isWizardSaving = false;
    wizardState = { step: 1, photoFile: null, photoBase64: null, uploadedUrl: null };
    showWizardStep(1);
    document.getElementById('wiz-photo-input').value = '';
    document.getElementById('wiz-name').value = '';
    document.getElementById('wiz-buy-price').value = '';
    document.getElementById('wiz-sell-price').value = '';
    document.getElementById('wiz-stock').value = '10';
    document.getElementById('wizard-modal').classList.remove('hidden');
    document.getElementById('wizard-modal').classList.add('flex');
}

function closeWizard() {
    isWizardSaving = false;
    document.getElementById('wizard-modal').classList.add('hidden');
    document.getElementById('wizard-modal').classList.remove('flex');
}

function showWizardStep(stepNum) {
    wizardState.step = stepNum;
    [1, 2, 3, 4].forEach(s => {
        const stepEl = document.getElementById(`wiz-step-${s}`);
        if (stepEl) {
            if (s === stepNum) {
                stepEl.classList.remove('hidden');
                stepEl.classList.add('flex');
            } else {
                stepEl.classList.add('hidden');
                stepEl.classList.remove('flex');
            }
        }
    });
    if (window.lucide) lucide.createIcons();
}

async function handleWizardPhotoSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    wizardState.photoFile = file;

    const reader = new FileReader();
    reader.onload = async (e) => {
        wizardState.photoBase64 = e.target.result;
        showWizardStep(2);

        try {
            const res = await apiFetch('/upload-image', {
                method: 'POST',
                body: JSON.stringify({ imageBase64: wizardState.photoBase64 })
            });

            if (res && res.url) {
                wizardState.uploadedUrl = res.url;
                document.getElementById('wiz-step3-preview').src = res.url;
                showWizardStep(3);
                setTimeout(() => document.getElementById('wiz-name').focus(), 300);
            } else {
                throw new Error('Upload failed');
            }
        } catch (err) {
            showToast('Failed to upload image. Try again.', true);
            showWizardStep(1);
        }
    };
    reader.readAsDataURL(file);
}

async function saveWizardProduct() {
    if (isWizardSaving) return;

    const name = document.getElementById('wiz-name').value.trim();
    const categoryId = document.getElementById('wiz-category').value || 1;
    const buyPrice = document.getElementById('wiz-buy-price').value || 0;
    const sellPrice = document.getElementById('wiz-sell-price').value || 0;
    const stock = document.getElementById('wiz-stock').value || 0;

    if (!name) {
        showToast('Please enter a product name', true);
        document.getElementById('wiz-name').focus();
        return;
    }

    isWizardSaving = true;

    // Disable Step 3 buttons during upload to prevent duplicate taps
    const step3Btns = document.querySelectorAll('#wiz-step-3 button');
    step3Btns.forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.6';
        b.style.pointerEvents = 'none';
    });

    const formData = new FormData();
    formData.append('name', name);
    formData.append('categoryId', categoryId);
    formData.append('buyPrice', buyPrice);
    formData.append('sellPrice', sellPrice);
    formData.append('stock', stock);
    if (wizardState.photoFile) {
        formData.append('photo', wizardState.photoFile);
    }

    try {
        const res = await fetch(`${API_BASE}/products`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Failed to save product');

        showWizardStep(4);
        setTimeout(() => {
            closeWizard();
            refreshData();
            isWizardSaving = false;
        }, 1500);

    } catch (err) {
        showToast('Error saving product', true);
        isWizardSaving = false;
        step3Btns.forEach(b => {
            b.disabled = false;
            b.style.opacity = '1';
            b.style.pointerEvents = 'auto';
        });
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
        await apiFetch(`/products/${id}`, { method: 'DELETE' });
        showToast('Product deleted');
        refreshData();
    } catch (err) {
        showToast(err.message, true);
    }
}

function openStatsModal(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    document.getElementById('statsTitle').textContent = p.name;
    document.getElementById('statsCat').textContent = p.category?.name || p.category || 'General';
    document.getElementById('statsPrices').textContent = `${formatINR(p.buyPrice)} / ${formatINR(p.sellPrice)}`;
    document.getElementById('statsStock').textContent = `${p.stock} Units`;

    const img = document.getElementById('statsImg');
    const noImg = document.getElementById('statsNoImg');
    const photo = p.photoUrl || p.imageUrl;

    if (photo) {
        img.src = photo;
        img.classList.remove('hidden');
        noImg.classList.add('hidden');
    } else {
        img.classList.add('hidden');
        noImg.classList.remove('hidden');
    }

    document.getElementById('productStatsModal').classList.remove('hidden');
}

function closeStatsModal() {
    document.getElementById('productStatsModal').classList.add('hidden');
}

// Staff & PDF Export
function openEmployeeModal() {
    document.getElementById('empNameInput').value = '';
    document.getElementById('empRoleInput').value = '';
    document.getElementById('empSalaryInput').value = '';
    document.getElementById('empHolidaysInput').value = '12';
    document.getElementById('employeeModal').classList.remove('hidden');
}

function closeEmployeeModal() {
    document.getElementById('employeeModal').classList.add('hidden');
}

async function handleSaveEmployee(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('empNameInput').value,
        role: document.getElementById('empRoleInput').value,
        monthlyExpense: Number(document.getElementById('empSalaryInput').value),
        holidaysLeft: Number(document.getElementById('empHolidaysInput').value)
    };

    try {
        await apiFetch('/employees', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Staff member added');
        closeEmployeeModal();
        refreshData();
    } catch (err) {
        showToast(err.message, true);
    }
}

function renderEmployees() {
    const grid = document.getElementById('employeeGrid');
    if (!grid) return;

    if (employees.length === 0) {
        grid.innerHTML = `<div class="col-span-full p-6 text-center text-[#94A3B8] bg-[#171A21] rounded-3xl border border-[#2A2F3A]">No employees listed. Click "+ Add Staff" to get started.</div>`;
        return;
    }

    grid.innerHTML = employees.map(e => `
        <div class="bg-[#171A21] p-4 rounded-3xl border border-[#2A2F3A] space-y-3">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-extrabold text-xs text-[#F8FAFC]">${e.name}</h4>
                    <p class="text-[10px] text-[#94A3B8] font-bold">${e.role}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#5B8CFF]/10 text-[#5B8CFF]">
                    ₹${Number(e.monthlyExpense || 0).toLocaleString('en-IN')}/mo
                </span>
            </div>

            <div class="flex items-center justify-between bg-[#0F1115] p-2.5 rounded-2xl border border-[#2A2F3A]">
                <div>
                    <div class="text-[9px] text-[#94A3B8] uppercase font-bold">Holidays Left</div>
                    <div class="text-xs font-black text-[#22C55E]">${e.holidaysLeft} Days</div>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="adjustHolidays(${e.id}, -1)" class="w-6 h-6 bg-[#1E222B] rounded-lg text-[#F8FAFC] font-bold">-</button>
                    <button onclick="adjustHolidays(${e.id}, 1)" class="w-6 h-6 bg-[#1E222B] rounded-lg text-[#F8FAFC] font-bold">+</button>
                </div>
            </div>

            <button onclick="openLeaveModal(${e.id})" class="w-full py-2 bg-[#1E222B] hover:bg-[#2A2F3A] text-[#F8FAFC] rounded-xl text-xs font-bold border border-[#2A2F3A]">
                Log Leave Date
            </button>
        </div>
    `).join('');
}

async function adjustHolidays(id, delta) {
    try {
        await apiFetch(`/employees/${id}/holidays`, {
            method: 'PUT',
            body: JSON.stringify({ adjust: delta })
        });
        refreshData();
    } catch (err) {
        showToast(err.message, true);
    }
}

function openLeaveModal(empId) {
    document.getElementById('leaveEmpId').value = empId;
    document.getElementById('leaveDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('leaveModal').classList.remove('hidden');
}

function closeLeaveModal() {
    document.getElementById('leaveModal').classList.add('hidden');
}

async function handleSaveLeave(e) {
    e.preventDefault();
    const empId = document.getElementById('leaveEmpId').value;
    const payload = {
        leaveDate: document.getElementById('leaveDate').value,
        days: parseInt(document.getElementById('leaveDays').value, 10) || 1,
        reason: document.getElementById('leaveReason').value
    };

    try {
        await apiFetch(`/employees/${empId}/leave`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        showToast('Leave recorded successfully');
        closeLeaveModal();
        refreshData();
    } catch (err) {
        showToast(err.message, true);
    }
}

// EXPORT STAFF & LEAVES TO PDF (Clean printable PDF report generator)
function exportStaffPDF() {
    const monthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const printWin = window.open('', '_blank');
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Staff Roster & Leave Report - ${monthName}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px; color: #1e293b; }
                .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-between; align-items: center; }
                h1 { font-size: 24px; margin: 0; color: #0f172a; }
                .subtitle { color: #64748b; font-size: 13px; margin-top: 4px; }
                table { w-full; width: 100%; border-collapse: collapse; margin-top: 15px; }
                th { background-color: #f8fafc; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; border-bottom: 2px solid #e2e8f0; }
                td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
                .total-card { margin-top: 25px; padding: 15px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; display: inline-block; }
                .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>Digital Desk — Staff Roster & Leave Report</h1>
                    <div class="subtitle">Monthly Payroll & Leave Balances Report (${monthName})</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Employee Name</th>
                        <th>Role / Position</th>
                        <th>Monthly Salary (₹)</th>
                        <th>Holidays Remaining</th>
                    </tr>
                </thead>
                <tbody>
    `;

    let totalExpense = 0;
    employees.forEach(emp => {
        totalExpense += Number(emp.monthlyExpense || 0);
        html += `
            <tr>
                <td><strong>${emp.name}</strong></td>
                <td>${emp.role}</td>
                <td>₹${Number(emp.monthlyExpense || 0).toLocaleString('en-IN')}</td>
                <td><strong style="color: #16a34a;">${emp.holidaysLeft} Days</strong></td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>

            <div class="total-card">
                <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold;">Total Monthly Staff Payroll</div>
                <div style="font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 4px;">₹${totalExpense.toLocaleString('en-IN')}</div>
            </div>

            <div class="footer">
                Generated automatically by Digital Desk Store Management App on ${new Date().toLocaleString('en-IN')}
            </div>

            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `;

    printWin.document.write(html);
    printWin.document.close();
}

async function loadSalesReport() {
    const from = document.getElementById('reportFromDate').value;
    const to = document.getElementById('reportToDate').value;

    try {
        const query = (from && to) ? `?from=${from}&to=${to}` : '';
        const data = await apiFetch(`/sales/report${query}`);
        
        document.getElementById('reportSummaryText').textContent = `Total Sales: ${formatINR(data?.summary?.revenue)}`;
        
        const body = document.getElementById('salesReportBody');
        if (!body) return;

        const sales = data?.sales || [];
        if (sales.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-[#94A3B8]">No sales transactions logged for this range.</td></tr>`;
            return;
        }

        body.innerHTML = sales.map(s => `
            <tr>
                <td class="p-3.5 font-bold text-[#5B8CFF]">#INV-${s.id}</td>
                <td class="p-3.5 text-[#94A3B8]">${s.date}</td>
                <td class="p-3.5 text-[#F8FAFC]">${s.items || 'General Purchase'}</td>
                <td class="p-3.5 font-bold text-[#22C55E]">${s.paymentMode || 'CASH'}</td>
                <td class="p-3.5 text-right font-black text-[#F8FAFC]">${formatINR(s.total)}</td>
            </tr>
        `).join('');
    } catch (err) {
        showToast(err.message, true);
    }
}

function renderCategories() {
    const container = document.getElementById('categoriesBadgeList');
    if (!container) return;
    container.innerHTML = categories.map(c => `
        <span class="px-3 py-1.5 bg-[#0F1115] border border-[#2A2F3A] rounded-xl text-xs font-bold text-[#F8FAFC] flex items-center gap-2">
            ${c.name}
            <button onclick="deleteCategory(${c.id})" class="text-[#EF4444] hover:text-white">×</button>
        </span>
    `).join('');
}

async function handleAddCategory() {
    const name = document.getElementById('newCategoryInput').value.trim();
    if (!name) return;
    try {
        await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name }) });
        document.getElementById('newCategoryInput').value = '';
        refreshData();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function deleteCategory(id) {
    try {
        await apiFetch(`/categories/${id}`, { method: 'DELETE' });
        refreshData();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function handleDevReset() {
    if (!confirm("Are you sure you want to clear all test data? This will wipe all products, sales, and staff records!")) return;
    try {
        await apiFetch('/dev/reset-data', { method: 'POST' });
        showToast('Database test data cleared successfully');
        refreshData();
    } catch (err) {
        showToast(err.message, true);
    }
}

window.onload = function() {
    checkAuth();
    setInterval(() => {
        if (document.visibilityState === 'visible') refreshData();
    }, 5000);
};
