const API_BASE = '/api';
let selectedPaymentMode = 'CASH';

let products = [];
let categories = [];
let cart = {};
let currentSearch = '';
let posSearchQuery = '';
let todayRevenue = 0;

// Wizard State
let wizardState = {
    step: 1,
    photoFile: null,
    photoBase64: null,
    uploadedUrl: null
};

const formatINR = (amount) => '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const els = {};

function initElements() {
    els.homeTab = document.getElementById('home-tab');
    els.inventoryTab = document.getElementById('inventory-tab');
    els.pageTitle = document.getElementById('page-title');
    els.navHome = document.getElementById('nav-home');
    els.navInventory = document.getElementById('nav-inventory');
    els.totalRevenue = document.getElementById('total-revenue');
    els.alertsContainer = document.getElementById('alerts-container');
    els.productsList = document.getElementById('products-list');
    els.searchInput = document.getElementById('search-input');
    els.posModal = document.getElementById('pos-modal');
    els.posGrid = document.getElementById('pos-product-grid');
    els.posSearchInput = document.getElementById('pos-search-input');
    els.cartCount = document.getElementById('cart-count');
    els.cartTotal = document.getElementById('cart-total');
    els.chargeBtn = document.getElementById('charge-btn');
}

function setSyncStatus(status) {
    const badge = document.getElementById('syncStatusBadge');
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncStatusText');
    if (!badge || !dot || !text) return;

    if (status === 'synced') {
        badge.className = "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200";
        dot.className = "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse";
        text.textContent = "Live Sync";
    } else if (status === 'syncing') {
        badge.className = "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200";
        dot.className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping";
        text.textContent = "Syncing...";
    } else {
        badge.className = "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-200";
        dot.className = "w-1.5 h-1.5 rounded-full bg-red-500";
        text.textContent = "Offline";
    }
}

function showToast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl text-sm font-bold shadow-xl ${
        type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-500 text-white'
    } animate-[slideUp_0.3s_ease-out]`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('dd_token');
    setSyncStatus('syncing');
    try {
        const res = await fetch(API_BASE + path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(options.headers || {})
            }
        });
        if (res.status === 401) {
            localStorage.clear();
            location.reload();
            return null;
        }
        const data = res.ok ? await res.json() : null;
        setSyncStatus(data ? 'synced' : 'offline');
        return data;
    } catch(e) {
        setSyncStatus('offline');
        return null;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.innerHTML = `<i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>`;
    if (window.lucide) lucide.createIcons();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    if (data && data.token) {
        localStorage.setItem('dd_token', data.token);
        if (data.role) localStorage.setItem('dd_role', data.role);
        if (data.user && data.user.name) localStorage.setItem('dd_name', data.user.name);
    } else if (email && password) {
        localStorage.setItem('dd_token', 'mock_token');
        localStorage.setItem('dd_name', 'Admin User');
    }
    
    checkAuth();
}

function logout() {
    localStorage.clear();
    location.reload();
}

function checkAuth() {
    const token = localStorage.getItem('dd_token');
    if (token) {
        document.getElementById('login-modal')?.classList.add('hidden');
        const name = localStorage.getItem('dd_name') || 'User';
        document.getElementById('user-subtitle').innerText = `Hello, ${name}`;
        loadInitialData();
        syncOfflineQueue();
    } else {
        document.getElementById('login-modal')?.classList.remove('hidden');
    }
}

async function loadInitialData() {
    await loadCategories();
    await loadProducts();
}

async function loadCategories() {
    const data = await apiFetch('/categories');
    if (Array.isArray(data)) {
        categories = data;
        const wizSelect = document.getElementById('wiz-category');
        if (wizSelect && categories.length > 0) {
            wizSelect.innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    }
}

async function loadProducts() {
    if (navigator.onLine) {
        try {
            const data = await apiFetch('/products');
            if (Array.isArray(data)) {
                products = data.map(p => ({
                    id: p.id,
                    name: p.name,
                    buyPrice: p.buyPrice || 0,
                    price: p.sellPrice || p.price || 0,
                    stock: p.stock || 0,
                    photoUrl: p.photoUrl || null,
                    category: p.category?.name || 'General'
                }));
                localStorage.setItem('dd_products', JSON.stringify(products));
                
                const summary = await apiFetch('/sales/summary');
                if (summary && summary.todayRevenue !== undefined) {
                    todayRevenue = summary.todayRevenue;
                }
            }
        } catch (e) {
            const cached = localStorage.getItem('dd_products');
            if (cached) products = JSON.parse(cached);
        }
    } else {
        const cached = localStorage.getItem('dd_products');
        if (cached) products = JSON.parse(cached);
    }
    updateUI();
}

async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('dd_offline_queue') || '[]');
    if (queue.length === 0) return;
    
    const synced = [];
    for (const sale of queue) {
        try {
            const res = await apiFetch('/sales', { method: 'POST', body: JSON.stringify(sale) });
            if (res) synced.push(sale.id);
        } catch (e) {}
    }
    
    const remaining = queue.filter(s => !synced.includes(s.id));
    localStorage.setItem('dd_offline_queue', JSON.stringify(remaining));
    if (synced.length > 0) showToast(`${synced.length} offline sale(s) synced!`);
}

// Navigation
function switchTab(tabName) {
    if (tabName === 'home') {
        els.homeTab.classList.add('active');
        els.inventoryTab.classList.remove('active');
        els.pageTitle.innerText = 'Dashboard';
        els.navHome.classList.replace('text-slate-400', 'text-[#5D5FEF]');
        els.navInventory.classList.replace('text-[#5D5FEF]', 'text-slate-400');
    } else {
        els.inventoryTab.classList.add('active');
        els.homeTab.classList.remove('active');
        els.pageTitle.innerText = 'Inventory';
        els.navInventory.classList.replace('text-slate-400', 'text-[#5D5FEF]');
        els.navHome.classList.replace('text-[#5D5FEF]', 'text-slate-400');
    }
}

function forceToInventorySearch(productName) {
    switchTab('inventory');
    els.searchInput.value = productName;
    currentSearch = productName.toLowerCase();
    renderInventory();
}

async function updateStock(id, change) {
    const p = products.find(prod => prod.id === id);
    if (p) {
        const newStock = Math.max(0, p.stock + change);
        p.stock = newStock;
        updateUI();

        const formData = new FormData();
        formData.append('name', p.name);
        formData.append('stock', newStock);
        formData.append('buyPrice', p.buyPrice);
        formData.append('sellPrice', p.price);

        await fetch(`${API_BASE}/products/${id}`, {
            method: 'PUT',
            body: formData
        }).catch(() => {});
        loadProducts();
    }
}

async function deleteProduct(id) {
    if (confirm('Delete this item?')) {
        products = products.filter(p => p.id !== id);
        updateUI();
        await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' }).catch(() => {});
        showToast('Item deleted');
        loadProducts();
    }
}

// --- 4-STEP PRODUCT WIZARD FLOW ---

function openWizard() {
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
        showWizardStep(2); // Uploading...

        try {
            const res = await apiFetch('/upload-image', {
                method: 'POST',
                body: JSON.stringify({ imageBase64: wizardState.photoBase64 })
            });

            if (res && res.url) {
                wizardState.uploadedUrl = res.url;
                document.getElementById('wiz-step3-preview').src = res.url;
                showWizardStep(3); // Details & Preview
                setTimeout(() => document.getElementById('wiz-name').focus(), 300);
            } else {
                throw new Error('Upload failed');
            }
        } catch (err) {
            showToast('Failed to upload image. Try again.', 'error');
            showWizardStep(1);
        }
    };
    reader.readAsDataURL(file);
}

async function saveWizardProduct() {
    const name = document.getElementById('wiz-name').value.trim();
    const categoryId = document.getElementById('wiz-category').value || 1;
    const buyPrice = document.getElementById('wiz-buy-price').value || 0;
    const sellPrice = document.getElementById('wiz-sell-price').value || 0;
    const stock = document.getElementById('wiz-stock').value || 0;

    if (!name) {
        showToast('Please enter a product name', 'error');
        document.getElementById('wiz-name').focus();
        return;
    }
    if (!sellPrice) {
        showToast('Please enter a sell price', 'error');
        document.getElementById('wiz-sell-price').focus();
        return;
    }

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

        showWizardStep(4); // Done
        setTimeout(() => {
            closeWizard();
            loadProducts();
        }, 1500);

    } catch (err) {
        showToast('Error saving product', 'error');
    }
}

// --- POS CHECKOUT & SEARCH ---

function openPOS() {
    posSearchQuery = '';
    if (els.posSearchInput) els.posSearchInput.value = '';
    els.posModal.classList.remove('hidden');
    els.posModal.classList.add('flex');
    renderPOS();
}

function closePOS() {
    els.posModal.classList.add('hidden');
    els.posModal.classList.remove('flex');
    clearCart();
}

function handlePosSearch(e) {
    posSearchQuery = (e.target.value || '').toLowerCase();
    renderPOS();
}

function handleTapProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const currentQty = cart[id] || 0;
    
    if (currentQty < product.stock) {
        cart[id] = currentQty + 1;
        renderPOS();
    } else {
        showToast('No more stock available!', 'error');
    }
}

function clearCart() {
    cart = {};
    renderPOS();
}

function setPaymentMode(mode) {
    selectedPaymentMode = mode;
    ['pm-cash', 'pm-upi', 'pm-card'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.className = `flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                id === `pm-${mode.toLowerCase()}` 
                ? 'bg-slate-900 text-white' 
                : 'bg-slate-100 text-slate-600'
            }`;
        }
    });
}

async function checkout() {
    let hasItems = false;
    const items = [];
    
    for (const id in cart) {
        const qty = cart[id];
        if (qty > 0) {
            hasItems = true;
            items.push({ productId: parseInt(id), quantity: qty });
        }
    }
    
    if (!hasItems) return;

    const salePayload = {
        id: Date.now().toString(),
        items,
        paymentMode: selectedPaymentMode
    };

    const btn = els.chargeBtn;
    const originalHtml = btn.innerHTML;

    if (navigator.onLine) {
        btn.innerHTML = `<i data-lucide="loader-2" class="w-8 h-8 animate-spin"></i>`;
        if (window.lucide) lucide.createIcons();

        const res = await apiFetch('/sales', { method: 'POST', body: JSON.stringify(salePayload) });
        if (res && res.error) {
            showToast(res.error, 'error');
            btn.innerHTML = originalHtml;
            if (window.lucide) lucide.createIcons();
            return;
        } else if (res) {
            btn.innerHTML = `<i data-lucide="check-circle" class="w-8 h-8"></i> SUCCESS!`;
            btn.classList.replace('bg-green-500', 'bg-green-600');
            if (window.lucide) lucide.createIcons();
            
            // Reload stock immediately from server to guarantee sync
            await loadProducts();

            setTimeout(() => {
                closePOS();
                btn.innerHTML = originalHtml;
                updateUI();
            }, 1000);
        } else {
            saveToOfflineQueue(salePayload);
            showSuccessAnimation(btn);
        }
    } else {
        saveToOfflineQueue(salePayload);
        showSuccessAnimation(btn);
    }
}

function saveToOfflineQueue(salePayload) {
    const queue = JSON.parse(localStorage.getItem('dd_offline_queue') || '[]');
    queue.push(salePayload);
    localStorage.setItem('dd_offline_queue', JSON.stringify(queue));
    showToast('Saved offline. Will sync when online.');
}

function showSuccessAnimation(btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check-circle" class="w-8 h-8"></i> SUCCESS!`;
    btn.classList.replace('bg-green-500', 'bg-green-600');
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
        closePOS();
        btn.innerHTML = originalHtml;
        updateUI();
    }, 1000);
}

// Rendering
function renderHome() {
    let revenue = todayRevenue > 0 ? todayRevenue : 0;
    els.totalRevenue.innerText = `${formatINR(revenue)}`;

    const alerts = products.filter(p => p.stock <= 5);
    if (alerts.length === 0) {
        els.alertsContainer.innerHTML = `
            <div class="bg-green-50 text-green-700 p-4 rounded-2xl border border-green-100 font-medium flex items-center justify-center">
                All stock looks good! 🎉
            </div>
        `;
    } else {
        els.alertsContainer.innerHTML = alerts.map(item => `
            <div class="bg-white p-4 rounded-2xl border border-red-100 flex justify-between items-center shadow-sm">
                <div class="flex items-center gap-3">
                    ${item.photoUrl ? `<img src="${item.photoUrl}" class="w-10 h-10 rounded-xl object-cover">` : ''}
                    <div>
                        <div class="font-bold text-slate-900">${item.name}</div>
                        <div class="text-sm font-semibold ${item.stock === 0 ? 'text-red-500' : 'text-orange-500'}">
                            ${item.stock === 0 ? 'Out of stock!' : `Only ${item.stock} left`}
                        </div>
                    </div>
                </div>
                <button onclick="forceToInventorySearch('${item.name}')" class="p-2 bg-slate-100 rounded-xl text-slate-600 active:scale-95">
                    <i data-lucide="arrow-right" class="w-5 h-5"></i>
                </button>
            </div>
        `).join('');
    }
    if (window.lucide) lucide.createIcons();
}

function renderInventory() {
    const filtered = products.filter(p => p.name.toLowerCase().includes(currentSearch));
    
    if (filtered.length === 0) {
        els.productsList.innerHTML = `<div class="p-8 text-center text-slate-400 font-medium">No items found. Tap + to add one!</div>`;
        return;
    }

    els.productsList.innerHTML = filtered.map(product => `
        <div class="bg-white p-4 rounded-2xl border-2 border-slate-100 flex items-center justify-between shadow-sm">
            <div class="flex items-center gap-3 flex-1">
                ${product.photoUrl 
                    ? `<img src="${product.photoUrl}" class="w-12 h-12 rounded-xl object-cover border border-slate-100">`
                    : `<div class="w-12 h-12 rounded-xl bg-indigo-50 text-[#5D5FEF] font-extrabold flex items-center justify-center">${product.name.charAt(0).toUpperCase()}</div>`}
                <div>
                    <h3 class="font-bold text-lg text-slate-900">${product.name}</h3>
                    <div class="text-[#5D5FEF] font-black">${formatINR(product.price)}</div>
                </div>
            </div>
            
            <div class="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                <button onclick="updateStock(${product.id}, -1)" class="p-2 bg-white rounded-xl shadow-sm active:bg-slate-200 text-slate-600">
                    <i data-lucide="minus" class="w-5 h-5"></i>
                </button>
                <span class="font-bold text-lg w-6 text-center">${product.stock}</span>
                <button onclick="updateStock(${product.id}, 1)" class="p-2 bg-white rounded-xl shadow-sm active:bg-slate-200 text-slate-600">
                    <i data-lucide="plus" class="w-5 h-5"></i>
                </button>
            </div>

            <button onclick="deleteProduct(${product.id})" class="ml-3 p-3 text-red-400 hover:text-red-600 active:scale-95 bg-red-50 rounded-2xl">
                <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function renderPOS() {
    let availableProducts = products.filter(p => p.stock > 0);
    
    if (posSearchQuery) {
        availableProducts = availableProducts.filter(p => p.name.toLowerCase().includes(posSearchQuery));
    }

    if (availableProducts.length === 0) {
        els.posGrid.innerHTML = `<div class="col-span-2 p-8 text-center text-slate-400 font-medium">No items found matching your search.</div>`;
    } else {
        els.posGrid.innerHTML = availableProducts.map(product => {
            const qty = cart[product.id] || 0;
            const isSelected = qty > 0;
            
            return `
                <button 
                    onclick="handleTapProduct(${product.id})"
                    class="text-left p-4 rounded-3xl border-4 transition-all relative active:scale-95 flex flex-col justify-between ${isSelected ? 'border-[#5D5FEF] bg-indigo-50' : 'border-white bg-white shadow-sm'}"
                >
                    ${isSelected ? `
                        <div class="absolute -top-3 -right-3 w-8 h-8 bg-[#5D5FEF] text-white rounded-full flex items-center justify-center font-black border-4 border-slate-50">
                            ${qty}
                        </div>
                    ` : ''}
                    <div class="mb-2">
                        ${product.photoUrl ? `<img src="${product.photoUrl}" class="w-full h-24 rounded-2xl object-cover mb-2">` : ''}
                        <h3 class="font-bold text-base text-slate-900 leading-tight">${product.name}</h3>
                    </div>
                    <div class="font-black text-[#5D5FEF] text-lg">${formatINR(product.price)}</div>
                </button>
            `;
        }).join('');
    }

    let total = 0;
    let count = 0;
    for (const id in cart) {
        const qty = cart[id];
        const p = products.find(prod => prod.id == id);
        if (p) {
            total += (p.price * qty);
            count += qty;
        }
    }

    els.cartCount.innerText = `${count} Items`;
    els.cartTotal.innerText = `${formatINR(total)}`;

    if (total > 0) {
        els.chargeBtn.className = 'w-full py-5 rounded-2xl text-xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 bg-green-500 text-white shadow-xl shadow-green-200';
    } else {
        els.chargeBtn.className = 'w-full py-5 rounded-2xl text-xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 bg-slate-100 text-slate-400';
    }
}

function updateUI() {
    renderHome();
    renderInventory();
    if (!els.posModal.classList.contains('hidden')) {
        renderPOS();
    }
}

// Events & Boot
document.addEventListener('DOMContentLoaded', () => {
    initElements();

    els.searchInput?.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        renderInventory();
    });

    window.addEventListener('online', () => {
        setSyncStatus('synced');
        syncOfflineQueue();
        loadProducts();
    });

    window.addEventListener('offline', () => {
        setSyncStatus('offline');
        showToast('You are offline. Using cached data.', 'error');
    });

    checkAuth();
    updateUI();

    // Auto sync product stock every 5 seconds
    setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine && localStorage.getItem('dd_token')) {
            loadProducts();
        }
    }, 5000);
});
