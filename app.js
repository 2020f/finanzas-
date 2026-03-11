/**
 * Personal Finance Dashboard Logic - Neon Dark Theme
 */

// Configuration
const CONFIG = {
    // The given URL for sharing is: https://docs.google.com/spreadsheets/d/19bBSf-VoSOICLebZ7bYyDZSuofTnDhWbpbSOo7J5kSU/edit?usp=sharing
    // We export it as CSV for easy parsing:
    googleSheetUrl: "https://docs.google.com/spreadsheets/d/19bBSf-VoSOICLebZ7bYyDZSuofTnDhWbpbSOo7J5kSU/export?format=csv",
    // Replace this with your Google Apps Script Web App URL once deployed
    googleAppScriptWriteUrl: "",
    colors: {
        income: '#10B981', // Neon green
        expense: '#EF4444', // Neon red
        neutral: '#9CA3AF', // Gray
        gridLine: '#374151', // Dark Gray for grids
        textMain: '#F3F4F6', // Off-white
        categoryColors: [
            '#10B981', '#34D399', '#059669', '#3B82F6', '#60A5FA', 
            '#8B5CF6', '#A78BFA', '#F59E0B', '#FBBF24', '#EC4899'
        ]
    }
};

// Global State
let rawData = [];
let filteredData = [];
let currentSort = { column: 'Fecha', direction: 'desc' };

// Chart Instances
let balanceChartInstance = null;
let categoryChartInstance = null;
let incomeExpenseChartInstance = null;

// DOM Elements
const elements = {
    totalBalance: document.getElementById('totalBalance'),
    totalIncome: document.getElementById('totalIncome'),
    totalExpenses: document.getElementById('totalExpenses'),
    monthIncome: document.getElementById('monthIncome'),
    monthExpense: document.getElementById('monthExpense'),
    lastUpdated: document.getElementById('lastUpdated'),
    refreshBtn: document.getElementById('refreshBtn'),
    searchInput: document.getElementById('searchInput'),
    typeFilter: document.getElementById('typeFilter'),
    categoryFilter: document.getElementById('categoryFilter'),
    tableBody: document.getElementById('transactionTableBody'),
    visibleCount: document.getElementById('visibleCount'),
    totalCount: document.getElementById('totalCount'),
    headers: document.querySelectorAll('th[data-sort]'),
    toast: document.getElementById('notificationToast'),
    toastMessage: document.getElementById('toastMessage'),
    toastIcon: document.getElementById('toastIcon'),
    
    // Form Elements
    transactionForm: document.getElementById('transactionForm'),
    formDate: document.getElementById('formDate'),
    formType: document.getElementById('formType'),
    formCategory: document.getElementById('formCategory'),
    formDescription: document.getElementById('formDescription'),
    formAmount: document.getElementById('formAmount')
};

/**
 * Initialize Application
 */
async function init() {
    setupEventListeners();
    // Default form date to today
    elements.formDate.value = new Date().toISOString().split('T')[0];
    await loadData();
}

/**
 * Parse CSV Data from Google Sheets
 */
function parseCsv(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        // Handle commas within quotes if needed (basic implementation)
        const currentline = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        
        if (currentline.length >= Math.min(headers.length, 2) && currentline.some(cell => cell.trim() !== '')) {
            const row = {};
            // Generate an ID for each parsed row
            row['id'] = crypto.randomUUID();
            for (let j = 0; j < headers.length; j++) {
                // Remove quotes from values
                row[headers[j]] = currentline[j] ? currentline[j].replace(/^"|"$/g, '').trim() : '';
            }
            
            // Standardize format 
            // Ensure fields are not undefined if Google Sheet headers differ slightly
            row['Fecha'] = row['Fecha'] || new Date().toISOString().split('T')[0];
            row['Tipo'] = row['Tipo'] || 'Gasto';
            row['Categoría'] = row['Categoría'] || 'Sin clasificar';
            row['Descripción'] = row['Descripción'] || '';
            row['Monto'] = parseFloat(row['Monto']) || 0;
            row['Método de pago'] = row['Método de pago'] || '';
            row['Cuenta'] = row['Cuenta'] || '';
            
            // Convert any DD/MM/YYYY into YYYY-MM-DD for sorting logic to work if needed
            if (row['Fecha'].includes('/') && row['Fecha'].split('/')[2] && row['Fecha'].split('/')[2].length === 4) {
               const parts = row['Fecha'].split('/');
               row['Fecha'] = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }

            data.push(row);
        }
    }
    
    // Sort descending by date
    return data.sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));
}

/**
 * Load and Parse Data
 */
async function loadData() {
    showLoading();
    try {
        if (CONFIG.googleSheetUrl) {
            const response = await fetch(CONFIG.googleSheetUrl);
            if (!response.ok) throw new Error("Failed to fetch Google Sheet");
            const csvText = await response.text();
            rawData = parseCsv(csvText);
        } else {
             throw new Error("No Google Sheet URL provided");
        }
        
        initializeFiltersMap();
        applyFiltersAndRender();
        
        const now = new Date();
        elements.lastUpdated.textContent = `Actualizado: ${now.toLocaleTimeString()}`;
        showToast("Datos cargados desde Google Sheets", "success");

    } catch (error) {
        console.error("Error loading data:", error);
        showToast("Error al cargar la hoja de Google", "error");
        
        // Render empty state if fails
        rawData = [];
        initializeFiltersMap();
        applyFiltersAndRender();
    }
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
    elements.refreshBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.typeFilter.value = '';
        elements.categoryFilter.value = '';
        loadData();
    });

    elements.searchInput.addEventListener('input', debounce(applyFiltersAndRender, 300));
    elements.typeFilter.addEventListener('change', () => {
        updateCategoryOptions();
        applyFiltersAndRender();
    });
    elements.categoryFilter.addEventListener('change', applyFiltersAndRender);

    elements.headers.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'desc';
            }
            applySortIndicators();
            applyFiltersAndRender();
        });
    });

    // Form Submission
    elements.transactionForm.addEventListener('submit', handleFormSubmit);
}

/**
 * Handle new transaction formulation
 */
function handleFormSubmit(e) {
    e.preventDefault();

    const newTransaction = {
        'id': crypto.randomUUID(),
        'Fecha': elements.formDate.value,
        'Tipo': elements.formType.value,
        'Categoría': elements.formCategory.value,
        'Descripción': elements.formDescription.value,
        'Monto': parseFloat(elements.formAmount.value) || 0,
        'Método de pago': 'Manual', 
        'Cuenta': 'Dashboard'
    };

    // Add to raw data array
    rawData.unshift(newTransaction);
    
    // Sort array to keep chronological order before rendering
    rawData.sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

    // Reset Form (keep date and type)
    elements.formCategory.value = '';
    elements.formDescription.value = '';
    elements.formAmount.value = '';

    // Trigger update
    initializeFiltersMap();
    applyFiltersAndRender();

    // Prepare data to send to Google Sheets
    const payload = {
        id: newTransaction.id,
        fecha: newTransaction.Fecha,
        tipo: newTransaction.Tipo,
        categoria: newTransaction.Categoría,
        descripcion: newTransaction.Descripción,
        metodoDePago: newTransaction['Método de pago'],
        monto: newTransaction.Monto,
        cuenta: newTransaction.Cuenta
    };

    if (CONFIG.googleAppScriptWriteUrl) {
        // Enviar a Google Sheets
        fetch(CONFIG.googleAppScriptWriteUrl, {
            method: 'POST',
            mode: 'no-cors', // Importante para enviar a Google Apps Script sin bloqueo CORS
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(() => {
             console.log("Dato enviado al Sheet");
        }).catch(err => console.error("Error guardando en Sheet:", err));
    }

    showToast("Transacción registrada localmente", "success");
}

function applySortIndicators() {
    elements.headers.forEach(header => {
        const icon = header.querySelector('i');
        const column = header.getAttribute('data-sort');
        
        icon.className = 'fa-solid ml-1 ';
        if (column === currentSort.column) {
            header.classList.add('text-fintech-green');
            icon.classList.add(currentSort.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
            icon.classList.remove('opacity-50');
        } else {
            header.classList.remove('text-fintech-green');
            icon.classList.add('fa-sort', 'opacity-50');
        }
    });
}

function showLoading() {
    elements.refreshBtn.classList.add('animate-spin');
    elements.tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-10 whitespace-nowrap text-center text-gray-400">
                <i class="fa-solid fa-circle-notch fa-spin text-3xl text-fintech-green mb-3 block mx-auto glow-icon"></i>
                <span class="block mt-2 font-medium tracking-wide">Procesando datos...</span>
            </td>
        </tr>
    `;
}

function initializeFiltersMap() {
    updateCategoryOptions();
}

function updateCategoryOptions() {
    const selectedType = elements.typeFilter.value;
    const categories = new Set();
    
    rawData.forEach(row => {
        if (!selectedType || row.Tipo === selectedType) {
            categories.add(row.Categoría);
        }
    });

    const currentSelection = elements.categoryFilter.value;
    
    let html = '<option value="">Todas las Categorías</option>';
    Array.from(categories).sort().forEach(cat => {
        html += `<option value="${cat}">${cat}</option>`;
    });
    
    elements.categoryFilter.innerHTML = html;
    
    if (categories.has(currentSelection)) {
        elements.categoryFilter.value = currentSelection;
    }
}

function applyFiltersAndRender() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const typeFilter = elements.typeFilter.value;
    const categoryFilter = elements.categoryFilter.value;

    filteredData = rawData.filter(row => {
        const matchesSearch = row.Descripción.toLowerCase().includes(searchTerm) || 
                              row.Monto.toString().includes(searchTerm) ||
                              row.Categoría.toLowerCase().includes(searchTerm);
                              
        const matchesType = !typeFilter || row.Tipo === typeFilter;
        const matchesCategory = !categoryFilter || row.Categoría === categoryFilter;

        return matchesSearch && matchesType && matchesCategory;
    });

    filteredData.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];

        if (currentSort.column === 'Monto') {
            valA = parseFloat(valA);
            valB = parseFloat(valB);
        } else if (currentSort.column === 'Fecha') {
            valA = new Date(valA).getTime();
            valB = new Date(valB).getTime();
        }

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const stats = calculateStats(filteredData);
    updateSummaryCards(stats);
    renderTable(filteredData);
    updateCharts(filteredData);
    
    elements.refreshBtn.classList.remove('animate-spin');
}

function calculateStats(data) {
    let totalIncome = 0;
    let totalExpenses = 0;
    let monthIncome = 0;
    let monthExpense = 0;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    data.forEach(row => {
        const amount = parseFloat(row.Monto);
        const date = new Date(row.Fecha);
        const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;

        if (row.Tipo === 'Ingreso') {
            totalIncome += amount;
            if (isCurrentMonth) monthIncome += amount;
        } else if (row.Tipo === 'Gasto') {
            totalExpenses += amount;
            if (isCurrentMonth) monthExpense += amount;
        }
    });

    return {
        balance: totalIncome - totalExpenses,
        totalIncome,
        totalExpenses,
        monthIncome,
        monthExpense
    };
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function updateSummaryCards(stats) {
    elements.totalBalance.textContent = formatCurrency(stats.balance);
    elements.totalBalance.className = `text-3xl font-bold ${stats.balance >= 0 ? 'text-white neon-text' : 'text-fintech-red drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`;
    
    elements.totalIncome.textContent = formatCurrency(stats.totalIncome);
    elements.totalExpenses.textContent = formatCurrency(stats.totalExpenses);
    
    elements.monthIncome.textContent = formatCurrency(stats.monthIncome);
    elements.monthExpense.textContent = formatCurrency(stats.monthExpense);
}

function renderTable(data) {
    elements.totalCount.textContent = rawData.length;
    elements.visibleCount.textContent = data.length;

    if (data.length === 0) {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-10 whitespace-nowrap text-center text-gray-500">
                    <div class="flex flex-col items-center justify-center">
                        <i class="fa-solid fa-ghost text-4xl text-gray-700 mb-3"></i>
                        <p class="text-lg text-gray-400">No hay registros</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    data.forEach(row => {
        const isIncome = row.Tipo === 'Ingreso';
        const typeIcon = isIncome ? 'fa-arrow-up text-fintech-green' : 'fa-arrow-down text-fintech-red';
        const bgBadge = isIncome ? 'bg-fintech-green/10 text-fintech-green border-fintech-green/30' : 'bg-red-500/10 text-red-400 border-red-500/30';
        const amountColor = isIncome ? 'text-fintech-green neon-text' : 'text-white';
        const amountPrefix = isIncome ? '+' : '-';

        html += `
            <tr class="hover:bg-gray-800/80 transition-colors duration-200">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    ${formatDate(row.Fecha)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${bgBadge}">
                        <i class="fa-solid ${typeIcon} mr-1.5 opacity-80"></i>
                        ${row.Tipo}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-200">${row.Categoría}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm text-gray-300 truncate max-w-xs" title="${row.Descripción}">${row.Descripción}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                    <div class="text-sm text-gray-400 font-medium">${row.Cuenta || 'N/A'}</div>
                    <div class="text-xs text-gray-500">${row['Método de pago'] || 'N/A'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-bold tracking-wide ${amountColor}">
                    ${amountPrefix} ${formatCurrency(row.Monto)}
                </td>
            </tr>
        `;
    });

    elements.tableBody.innerHTML = html;
}

// Chart Renderers Start
function updateCharts(data) {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = CONFIG.colors.neutral;
    
    renderBalanceChart(calculateBalanceEvolution(data));
    renderIncomeExpenseChart(aggregateByMonth(data));
    renderCategoryChart(aggregateByCategory(data.filter(r => r.Tipo === 'Gasto')));
}

function aggregateByMonth(data) {
    const monthly = {};
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
        monthly[key] = { income: 0, expense: 0, sortKey: d.getTime() };
    }

    data.forEach(row => {
        const date = new Date(row.Fecha);
        const key = `${months[date.getMonth()]} ${date.getFullYear()}`;
        if (!monthly[key]) {
             monthly[key] = { income: 0, expense: 0, sortKey: new Date(date.getFullYear(), date.getMonth(), 1).getTime() };
        }
        if (row.Tipo === 'Ingreso') monthly[key].income += parseFloat(row.Monto);
        else monthly[key].expense += parseFloat(row.Monto);
    });

    const sortedKeys = Object.keys(monthly).sort((a, b) => monthly[a].sortKey - monthly[b].sortKey);
    return {
        labels: sortedKeys,
        income: sortedKeys.map(k => monthly[k].income),
        expense: sortedKeys.map(k => monthly[k].expense)
    };
}

function aggregateByCategory(data) {
    const categories = {};
    data.forEach(row => {
        categories[row.Categoría] = (categories[row.Categoría] || 0) + parseFloat(row.Monto);
    });
    const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    return {
        labels: sortedCats.map(c => c[0]),
        values: sortedCats.map(c => c[1])
    };
}

function calculateBalanceEvolution(data) {
    const sortedData = [...data].sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
    const points = [];
    let currentBalance = 0;
    const daily = {};
    sortedData.forEach(row => {
        const amount = parseFloat(row.Monto);
        daily[row.Fecha] = (daily[row.Fecha] || 0) + (row.Tipo === 'Ingreso' ? amount : -amount);
    });

    Object.keys(daily).sort().forEach(date => {
        currentBalance += daily[date];
        points.push({ x: date, y: currentBalance });
    });
    return points;
}

function renderBalanceChart(dataPoints) {
    const ctx = document.getElementById('balanceChart');
    if (balanceChartInstance) balanceChartInstance.destroy();

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)'); // Neon Green
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    balanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataPoints.map(p => formatDate(p.x)),
            datasets: [{
                label: 'Balance',
                data: dataPoints.map(p => p.y),
                borderColor: CONFIG.colors.income,
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: '#000',
                pointBorderColor: CONFIG.colors.income,
                pointBorderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: function(context) { return ' ' + formatCurrency(context.parsed.y); } },
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: CONFIG.colors.income,
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
                y: { grid: { color: CONFIG.colors.gridLine, drawBorder: false }, ticks: { callback: function(value) { return '$' + value; } } }
            }
        }
    });
}

function renderIncomeExpenseChart(monthlyData) {
    const ctx = document.getElementById('incomeExpenseChart');
    if (incomeExpenseChartInstance) incomeExpenseChartInstance.destroy();

    incomeExpenseChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthlyData.labels,
            datasets: [
                {
                    label: 'Ingresos',
                    data: monthlyData.income,
                    backgroundColor: CONFIG.colors.income,
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Gastos',
                    data: monthlyData.expense,
                    backgroundColor: CONFIG.colors.expense,
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, color: '#D1D5DB' } },
                tooltip: {
                    callbacks: { label: function(context) { return ` ${context.dataset.label}: ${formatCurrency(context.parsed.y)}`; } },
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    borderColor: 'rgba(55, 65, 81, 1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: CONFIG.colors.gridLine, drawBorder: false }, ticks: { callback: function(value) { return '$' + value; } } }
            }
        }
    });
}

function renderCategoryChart(categoryData) {
    const ctx = document.getElementById('categoryChart');
    if (categoryChartInstance) categoryChartInstance.destroy();

    if (categoryData.labels.length === 0) {
        ctx.style.display = 'none';
        if (!document.getElementById('emptyPieMsg')) {
            ctx.parentElement.innerHTML += '<p class="text-sm text-gray-500 mt-20 text-center w-full" id="emptyPieMsg">No hay datos de gastos</p>';
        }
        return;
    } else {
        ctx.style.display = 'block';
        const emptyMsg = document.getElementById('emptyPieMsg');
        if(emptyMsg) emptyMsg.remove();
    }

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categoryData.labels,
            datasets: [{
                data: categoryData.values,
                backgroundColor: CONFIG.colors.categoryColors,
                borderWidth: 2,
                borderColor: '#111827', // Card background color to create spacing
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { usePointStyle: true, boxWidth: 8, padding: 15, font: { size: 11 }, color: '#D1D5DB'}
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const total = context.chart._metasets[context.datasetIndex].total;
                            const percentage = Math.round((value / total) * 100);
                            return ` ${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    },
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    borderColor: 'rgba(55, 65, 81, 1)',
                    borderWidth: 1
                }
            }
        }
    });
}


// Utils
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    if (type === 'success') {
        elements.toastIcon.className = 'fa-solid fa-check-circle text-fintech-green mr-3 text-xl neon-text';
        elements.toast.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        elements.toast.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.3)';
    } else {
        elements.toastIcon.className = 'fa-solid fa-triangle-exclamation text-fintech-red mr-3 text-xl';
        elements.toast.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        elements.toast.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.3)';
    }

    elements.toast.classList.add('toast-visible');
    setTimeout(() => { elements.toast.classList.remove('toast-visible'); }, 4000);
}

document.addEventListener('DOMContentLoaded', init);
