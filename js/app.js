const API = 'api/';

// ── Chart state ────────────────────────────────
let cpuChart     = null;
let storageChart = null;
let cpuHistory   = {};
let monitorTimer = null;

// ── Page navigation ────────────────────────────
function showPage(name, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (navEl) navEl.classList.add('active');

  // Stop monitor timer when leaving monitor page
  if (name !== 'monitor') destroyCharts();

  if (name === 'dashboard') { loadInstances(); loadBuckets(); }
  if (name === 'instances')   loadInstances();
  if (name === 'buckets')     loadBuckets();
  if (name === 'monitor')     loadMonitor();
}

// ── Toast notification ─────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Logout ─────────────────────────────────────
async function logout() {
  await fetch(API + 'auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logout' })
  });
  localStorage.removeItem('user_name');
  window.location.href = 'index.html';
}

// ── Load VM instances ──────────────────────────
async function loadInstances() {
  const res  = await fetch(API + 'instances.php');
  const rows = await res.json();
  const running = rows.filter(r => r.status === 'running').length;
  document.getElementById('m-vms').textContent     = rows.length;
  document.getElementById('m-running').textContent = running;

  const targets = ['dash-table', 'vm-table'];
  targets.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No instances yet — launch one!</div>';
      return;
    }
    el.innerHTML = `
      <div class="table-head">
        <span>Name</span><span>Status</span>
        <span>Type</span><span>Region</span><span>Actions</span>
      </div>` +
      rows.map(v => `
        <div class="table-row">
          <span><b style="font-weight:500">${v.name}</b>
            <br><span style="font-size:11px;color:#9ca3af">id: ${v.id}</span></span>
          <span><span class="pill ${v.status}">
            <span class="pill-dot"></span>${v.status}
          </span></span>
          <span style="font-size:12px;color:#6b7280">${v.cpu}vCPU / ${v.ram}GB</span>
          <span style="font-size:12px;color:#6b7280">${v.region}</span>
          <span>
            <button class="btn-sm" onclick="toggleVM(${v.id},'${v.status}')">
              ${v.status === 'running' ? 'Stop' : 'Start'}
            </button>
            <button class="btn-sm red" onclick="deleteVM(${v.id})">Delete</button>
          </span>
        </div>`).join('');
  });
}

// ── Create VM ──────────────────────────────────
async function createVM() {
  const name   = document.getElementById('vm-name').value.trim();
  const cpu    = document.getElementById('vm-cpu').value;
  const ram    = document.getElementById('vm-ram').value;
  const os     = document.getElementById('vm-os').value;
  const region = document.getElementById('vm-region').value;
  if (!name) { toast('Enter an instance name'); return; }
  const res  = await fetch(API + 'instances.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, cpu, ram, os, region })
  });
  const data = await res.json();
  if (data.success) {
    document.getElementById('vm-name').value = '';
    toast('Instance launched: ' + name);
    showPage('instances', null);
  } else {
    toast('Error: ' + data.error);
  }
}

// ── Toggle VM status ───────────────────────────
async function toggleVM(id, currentStatus) {
  const newStatus = currentStatus === 'running' ? 'stopped' : 'running';
  await fetch(API + 'instances.php', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status: newStatus })
  });
  toast('Instance ' + newStatus);
  loadInstances();
}

// ── Delete VM ──────────────────────────────────
async function deleteVM(id) {
  if (!confirm('Delete this instance?')) return;
  await fetch(API + 'instances.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  toast('Instance deleted');
  loadInstances();
}

// ── Load buckets ───────────────────────────────
async function loadBuckets() {
  const res   = await fetch(API + 'buckets.php');
  const rows  = await res.json();
  const total = rows.reduce((s, b) => s + parseInt(b.size_gb), 0);
  document.getElementById('m-buckets').textContent = rows.length;
  document.getElementById('m-storage').textContent  = total + ' GB';
  const el = document.getElementById('bucket-table');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="empty">No buckets yet — create one!</div>';
    return;
  }
  el.innerHTML = `
    <div class="table-head" style="grid-template-columns:2fr 1fr 1fr 1fr">
      <span>Name</span><span>Size</span><span>Access</span><span>Actions</span>
    </div>` +
    rows.map(b => `
      <div class="table-row" style="grid-template-columns:2fr 1fr 1fr 1fr">
        <span><b style="font-weight:500">${b.bucket_name}</b>
          <br><span style="font-size:11px;color:#9ca3af">${b.region}</span></span>
        <span style="font-size:13px">${b.size_gb} GB</span>
        <span><span class="pill ${b.access_type === 'public' ? 'running' : 'stopped'}">
          <span class="pill-dot"></span>${b.access_type}
        </span></span>
        <span><button class="btn-sm red" onclick="deleteBucket(${b.id})">Delete</button></span>
      </div>`).join('');
}

// ── Create bucket ──────────────────────────────
async function createBucket() {
  const name   = document.getElementById('b-name').value.trim();
  const size   = document.getElementById('b-size').value;
  const access = document.getElementById('b-access').value;
  const region = document.getElementById('b-region').value;
  if (!name) { toast('Enter a bucket name'); return; }
  const res  = await fetch(API + 'buckets.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket_name: name, size_gb: size, access_type: access, region })
  });
  const data = await res.json();
  if (data.success) {
    document.getElementById('b-name').value = '';
    toast('Bucket created: ' + name);
    showPage('buckets', null);
  } else {
    toast('Error: ' + data.error);
  }
}

// ── Delete bucket ──────────────────────────────
async function deleteBucket(id) {
  if (!confirm('Delete this bucket?')) return;
  await fetch(API + 'buckets.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  toast('Bucket deleted');
  loadBuckets();
}

// ── Monitor charts ─────────────────────────────
async function loadMonitor() {
  const res     = await fetch(API + 'instances.php');
  const rows    = await res.json();
  const running = rows.filter(r => r.status === 'running');

  function colorFor(pct) {
    return pct > 70 ? '#E24B4A' : pct > 40 ? '#BA7517' : '#3B6D11';
  }

  function barHtml(name, pct, color) {
    return `<div class="bar-row">
      <span class="bar-name">${name}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="bar-val" style="color:${color}">${pct}%</span>
    </div>`;
  }

  const cpuEl = document.getElementById('cpu-bars');
  const ramEl = document.getElementById('ram-bars');

  if (!running.length) {
    cpuEl.innerHTML = ramEl.innerHTML =
      '<p style="color:#9ca3af;font-size:13px">No running instances.</p>';
    destroyCharts();
    return;
  }

  const cpuValues = running.map(() => Math.floor(Math.random() * 80) + 5);
  const ramValues = running.map(() => Math.floor(Math.random() * 70) + 10);

  cpuEl.innerHTML = running.map((v, i) =>
    barHtml(v.name, cpuValues[i], colorFor(cpuValues[i]))
  ).join('');

  ramEl.innerHTML = running.map((v, i) =>
    barHtml(v.name, ramValues[i], colorFor(ramValues[i]))
  ).join('');

  // CPU history line chart
  running.forEach((v, i) => {
    if (!cpuHistory[v.id]) cpuHistory[v.id] = [];
    cpuHistory[v.id].push(cpuValues[i]);
    if (cpuHistory[v.id].length > 10) cpuHistory[v.id].shift();
  });

  const colors     = ['#185FA5','#639922','#BA7517','#E24B4A','#534AB7','#0F6E56'];
  const tickLabels = Array.from({ length: 10 }, (_, i) => i + 1);

  const cpuDatasets = running.map((v, i) => ({
    label: v.name,
    data: cpuHistory[v.id],
    borderColor: colors[i % colors.length],
    backgroundColor: colors[i % colors.length] + '22',
    tension: 0.4, fill: true, pointRadius: 3,
  }));

  if (cpuChart) {
    cpuChart.data.labels   = tickLabels;
    cpuChart.data.datasets = cpuDatasets;
    cpuChart.update();
  } else {
    cpuChart = new Chart(document.getElementById('cpu-chart'), {
      type: 'line',
      data: { labels: tickLabels, datasets: cpuDatasets },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
          x: { ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  // Storage bar chart
  const bucketRes = await fetch(API + 'buckets.php');
  const buckets   = await bucketRes.json();

  if (buckets.length) {
    const bLabels = buckets.map(b => b.bucket_name);
    const bSizes  = buckets.map(b => Math.round(b.size_gb * 0.4));
    const bTotal  = buckets.map(b => b.size_gb);

    if (storageChart) {
      storageChart.data.labels           = bLabels;
      storageChart.data.datasets[0].data = bSizes;
      storageChart.data.datasets[1].data = bTotal;
      storageChart.update();
    } else {
      storageChart = new Chart(document.getElementById('storage-chart'), {
        type: 'bar',
        data: {
          labels: bLabels,
          datasets: [
            { label: 'Used (GB)', data: bSizes, backgroundColor: '#185FA5', borderRadius: 4 },
            { label: 'Total (GB)', data: bTotal, backgroundColor: '#e5e7eb', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
          scales: {
            y: { ticks: { callback: v => v + ' GB' } },
            x: { ticks: { font: { size: 11 } } }
          }
        }
      });
    }
  }

  // Auto refresh every 3 seconds
  if (monitorTimer) clearTimeout(monitorTimer);
  monitorTimer = setTimeout(loadMonitor, 3000);
}

function destroyCharts() {
  if (cpuChart)     { cpuChart.destroy();     cpuChart = null; }
  if (storageChart) { storageChart.destroy(); storageChart = null; }
  if (monitorTimer) { clearTimeout(monitorTimer); monitorTimer = null; }
}

// ── Init on page load ──────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const name = localStorage.getItem('user_name');
  if (!name) { window.location.href = 'index.html'; return; }
  document.getElementById('user-name').textContent = name;
  loadInstances();
  loadBuckets();
});