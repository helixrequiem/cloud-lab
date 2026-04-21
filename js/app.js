const API = 'api/';

// ── Chart state ────────────────────────────────
let cpuChart     = null;
let storageChart = null;
let cpuHistory   = {};
let monitorTimer = null;
let allInstances = []; // stores full list for filtering
let allBuckets = []; // stores full list for filtering


// ── Page navigation ────────────────────────────
function showPage(name, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (navEl) navEl.classList.add('active');

  if (name !== 'monitor') destroyCharts();

  if (name === 'dashboard') { loadInstances(); loadBuckets(); loadBilling(); }
  if (name === 'instances')  loadInstances();
  if (name === 'buckets')    loadBuckets();
  if (name === 'monitor')    loadMonitor();
  if (name === 'log')        loadLog();
  if (name === 'billing')    loadBilling();
  if (name === 'bucket-files') loadFiles();
}
// ── Toast notification ─────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
// ── Log an action ──────────────────────────────
async function logAction(action, details = '') {
  await fetch(API + 'log.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, details })
  });
}
// ── Logout ─────────────────────────────────────
async function logout() {
  await fetch(API + 'auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logout' })
  });
  localStorage.removeItem('user_name');
  await logAction('Logged out', '');
  window.location.href = 'index.html';
}

// ── Load VM instances ──────────────────────────
async function loadInstances() {
  const res  = await fetch(API + 'instances.php');
  const rows = await res.json();
  allInstances = rows;
  const running = rows.filter(r => r.status === 'running').length;
  document.getElementById('m-vms').textContent     = rows.length;
  document.getElementById('m-running').textContent = running;
  renderInstanceTable(rows);
}
// ── Render instance table ──────────────────────
function renderInstanceTable(rows) {
  ['dash-table', 'vm-table'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No instances match your search.</div>';
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
// ── Filter instances ───────────────────────────
function filterInstances() {
  const search  = document.getElementById('vm-search')?.value.toLowerCase() || '';
  const status  = document.getElementById('vm-filter-status')?.value || '';
  const region  = document.getElementById('vm-filter-region')?.value || '';

  const filtered = allInstances.filter(v => {
    const matchName   = v.name.toLowerCase().includes(search);
    const matchStatus = !status || v.status === status;
    const matchRegion = !region || v.region === region;
    return matchName && matchStatus && matchRegion;
  });

  renderInstanceTable(filtered);
}

// ── Clear all filters ──────────────────────────
function clearFilters() {
  const search = document.getElementById('vm-search');
  const status = document.getElementById('vm-filter-status');
  const region = document.getElementById('vm-filter-region');
  if (search)  search.value  = '';
  if (status)  status.value  = '';
  if (region)  region.value  = '';
  renderInstanceTable(allInstances);
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
    await logAction('VM created', name + ' — ' + cpu + 'vCPU / ' + ram + 'GB');
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
  await logAction('VM ' + newStatus, 'Instance ID: ' + id);
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
  await logAction('VM deleted', 'Instance ID: ' + id);
  loadInstances();
}
// ── Export VM list as CSV ──────────────────────
async function exportCSV() {
  const res  = await fetch(API + 'instances.php');
  const rows = await res.json();

  if (!rows.length) {
    toast('No instances to export');
    return;
  }

  // Build CSV content
  const headers = ['ID', 'Name', 'Status', 'CPU (vCPU)', 'RAM (GB)', 'OS', 'Region', 'Created At'];
  const csvRows = rows.map(v => [
    v.id,
    v.name,
    v.status,
    v.cpu,
    v.ram,
    v.os,
    v.region,
    v.created_at
  ]);

  const csvContent = [headers, ...csvRows]
    .map(row => row.map(val => `"${val}"`).join(','))
    .join('\n');

  // Create download link and click it
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'cloudlab-instances-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);

  toast('CSV exported!');
  await logAction('CSV exported', rows.length + ' instances');
}
// ── Export buckets as CSV ──────────────────────
async function exportBucketsCSV() {
  const res  = await fetch(API + 'buckets.php');
  const rows = await res.json();

  if (!rows.length) {
    toast('No buckets to export');
    return;
  }

  // Calculate cost per bucket
  const headers = ['ID', 'Bucket Name', 'Size (GB)', 'Access', 'Region', 'Est. Monthly Cost', 'Created At'];
  const csvRows = rows.map(b => [
    b.id,
    b.bucket_name,
    b.size_gb,
    b.access_type,
    b.region,
    '$' + (b.size_gb * 0.023).toFixed(2),
    b.created_at
  ]);

  const csvContent = [headers, ...csvRows]
    .map(row => row.map(val => `"${val}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'cloudlab-buckets-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);

  toast('Buckets CSV exported!');
  await logAction('Buckets CSV exported', rows.length + ' buckets');
}
// ── Export full billing report as CSV ──────────
async function exportBillingCSV() {
  const [vmRes, bucketRes] = await Promise.all([
    fetch(API + 'instances.php'),
    fetch(API + 'buckets.php')
  ]);
  const vms     = await vmRes.json();
  const buckets = await bucketRes.json();

  if (!vms.length && !buckets.length) {
    toast('No resources to export');
    return;
  }

  const HOURS = 730;
  const lines = [];

  // ── Header ─────────────────────────────────
  lines.push(['"CloudLab — Monthly Cost Report"']);
  lines.push(['"Generated:"', `"${new Date().toLocaleString()}"`]);
  lines.push([]);

  // ── VM section ─────────────────────────────
  lines.push(['"VM INSTANCES"']);
  lines.push([
    '"Name"', '"Status"', '"CPU (vCPU)"',
    '"RAM (GB)"', '"Region"', '"Hourly Rate"', '"Monthly Est."'
  ]);

  let computeTotal = 0;
  vms.forEach(v => {
    let cost, hourly;
    if (v.status === 'running') {
      hourly = (v.cpu * 0.048 + v.ram * 0.006);
      cost   = hourly * HOURS;
    } else {
      hourly = 0.005;
      cost   = hourly * HOURS;
    }
    computeTotal += cost;
    lines.push([
      `"${v.name}"`, `"${v.status}"`, `"${v.cpu}"`,
      `"${v.ram}"`, `"${v.region}"`,
      `"$${hourly.toFixed(4)}/hr"`, `"$${cost.toFixed(2)}"`
    ]);
  });

  lines.push(['"Compute subtotal"', '', '', '', '', '', `"$${computeTotal.toFixed(2)}"`]);
  lines.push([]);

  // ── Bucket section ──────────────────────────
  lines.push(['"STORAGE BUCKETS"']);
  lines.push(['"Name"', '"Size (GB)"', '"Access"', '"Region"', '"Rate"', '"Monthly Est."']);

  let storageTotal = 0;
  buckets.forEach(b => {
    const cost = b.size_gb * 0.023;
    storageTotal += cost;
    lines.push([
      `"${b.bucket_name}"`, `"${b.size_gb}"`, `"${b.access_type}"`,
      `"${b.region}"`, `"$0.023/GB"`, `"$${cost.toFixed(2)}"`
    ]);
  });

  lines.push(['"Storage subtotal"', '', '', '', '', `"$${storageTotal.toFixed(2)}"`]);
  lines.push([]);

  // ── Grand total ─────────────────────────────
  const grand = computeTotal + storageTotal;
  lines.push(['"TOTAL MONTHLY ESTIMATE"', '', '', '', '', '', `"$${grand.toFixed(2)}"`]);

  // ── Build and download ──────────────────────
  const csvContent = lines.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'cloudlab-billing-report-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);

  toast('Billing report exported!');
  await logAction('Billing report exported', '$' + grand.toFixed(2) + ' total');
}
// ── Load Buckets ───────────────────────────────
async function loadBuckets() {
  const res   = await fetch(API + 'buckets.php');
  const rows  = await res.json();
  allBuckets = rows; // save full list
  const total = rows.reduce((s, b) => s + parseInt(b.size_gb), 0);

  // Update dashboard metrics
  document.getElementById('m-buckets').textContent = rows.length;
  document.getElementById('m-storage').textContent  = total + ' GB';
  renderBucketTable(rows);
}
// ── Render bucket table ──────────────────────
function renderBucketTable(rows) {
  ['dash-bucket-table', 'bucket-table'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No buckets match your search.</div>';
      return;
    }
    el.innerHTML = `
  <div class="table-head" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr">
    <span>Name</span><span>Size</span><span>Access</span><span>Region</span><span>Actions</span>
  </div>` +
  rows.map(b => `
    <div class="table-row" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr">
      <span><b style="font-weight:500">${b.bucket_name}</b>
        <br><span style="font-size:11px;color:#9ca3af">id: ${b.id}</span></span>
      <span style="font-size:13px">${b.size_gb} GB</span>
      <span><span class="pill ${b.access_type === 'public' ? 'running' : 'stopped'}">
        <span class="pill-dot"></span>${b.access_type}
      </span></span>
      <span style="font-size:12px;color:#6b7280">${b.region}</span>
      <span>
        <button class="btn-sm" onclick="openBucket(${b.id},'${b.bucket_name}')">Open</button>
        <button class="btn-sm red" onclick="deleteBucket(${b.id})">Delete</button>
      </span>
    </div>`).join('');
  });
}
 
// ── Filter buckets ───────────────────────────
function filterBuckets() {
  const search = document.getElementById('bucket-search')?.value.toLowerCase() || '';
  const access = document.getElementById('bucket-filter-access')?.value || '';
  const region = document.getElementById('bucket-filter-region')?.value || '';

  const filtered = allBuckets.filter(b => {
    const matchName   = b.bucket_name.toLowerCase().includes(search);
    const matchAccess = !access || b.access_type === access;
    const matchRegion = !region || b.region === region;
    return matchName && matchAccess && matchRegion;
  });

  renderBucketTable(filtered);
}

// ── Clear all bucket filters ─────────────────
function clearBucketFilters() {
  const search = document.getElementById('bucket-search');
  const access = document.getElementById('bucket-filter-access');
  const region = document.getElementById('bucket-filter-region');
  if (search) search.value = '';
  if (access) access.value = '';
  if (region) region.value = '';
  renderBucketTable(allBuckets);
}

// ── Create Bucket ──────────────────────────────
async function createBucket() {
  const name   = document.getElementById('b-name').value.trim();
  const size   = document.getElementById('b-size').value;
  const access = document.getElementById('b-access').value;
  const region = document.getElementById('b-region').value;

  if (!name) { toast('Enter a bucket name'); return; }

  const res = await fetch(API + 'buckets.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket_name: name, size_gb: size, access_type: access, region })
  });

  const data = await res.json();
  if (data.success) {
    document.getElementById('b-name').value = '';
    toast('Bucket created: ' + name);
    await logAction('Bucket created', name + ' — ' + size + 'GB ' + access);
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
  await logAction('Bucket deleted', 'Bucket ID: ' + id);
  loadBuckets();
}
// ── Current open bucket ────────────────────────
let currentBucketId   = null;
let currentBucketName = '';

// ── Open bucket contents ───────────────────────
function openBucket(id, name) {
  currentBucketId   = id;
  currentBucketName = name;
  document.getElementById('bucket-files-title').textContent = name;
  document.getElementById('bucket-files-sub').textContent   = 'bucket contents';
  showPage('bucket-files', null);
}

// ── Load files in bucket ───────────────────────
async function loadFiles() {
  const res   = await fetch(API + 'files.php?bucket_id=' + currentBucketId);
  const files = await res.json();
  const el    = document.getElementById('files-table');

  if (!files.length) {
    el.innerHTML = '<div class="empty">No files yet — upload one above!</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-head" style="grid-template-columns:2fr 1fr 1fr 1fr">
      <span>File</span><span>Size</span><span>Type</span><span>Actions</span>
    </div>` +
    files.map(f => {
      const size = f.file_size > 1048576
        ? (f.file_size / 1048576).toFixed(1) + ' MB'
        : (f.file_size / 1024).toFixed(0) + ' KB';
      const icon = iconForFile(f.file_type);
      const canPreview = f.file_type.startsWith('image/') ||
                         f.file_type === 'application/pdf' ||
                         f.file_type.startsWith('text/') ||
                         f.file_type.includes('officedocument') ||
                         f.file_type.includes('msword');
      return `
        <div class="table-row" style="grid-template-columns:2fr 1fr 1fr 1fr">
          <span style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">${icon}</span>
            <span>
              <b style="font-weight:500;font-size:13px">${f.original_name}</b>
              <br><span style="font-size:11px;color:#9ca3af">${new Date(f.created_at).toLocaleDateString()}</span>
            </span>
          </span>
          <span style="font-size:12px;color:#6b7280">${size}</span>
          <span style="font-size:12px;color:#6b7280">${f.file_type.split('/')[1] || f.file_type}</span>
          <span style="display:flex;gap:4px;flex-wrap:wrap;">
            ${canPreview ? `<button class="btn-sm" onclick="previewFile(${f.id},'${f.original_name}','${f.file_type}')">Preview</button>` : ''}
            <button class="btn-sm" onclick="downloadFile(${f.id})">Download</button>
            <button class="btn-sm red" onclick="deleteFile(${f.id})">Delete</button>
          </span>
        </div>`;
    }).join('');
}

// ── File type icons ────────────────────────────
function iconForFile(type) {
  if (type.startsWith('image/'))           return '🖼️';
  if (type === 'application/pdf')          return '📄';
  if (type.startsWith('text/'))            return '📝';
  if (type.includes('spreadsheet') ||
      type.includes('excel'))              return '📊';
  if (type.includes('presentation') ||
      type.includes('powerpoint'))         return '📑';
  if (type.includes('word') ||
      type.includes('document'))           return '📃';
  if (type.includes('zip') ||
      type.includes('compressed'))         return '🗜️';
  if (type.startsWith('video/'))           return '🎬';
  if (type.startsWith('audio/'))           return '🎵';
  return '📁';
}

// ── Upload file ────────────────────────────────
async function uploadFile(file) {
  if (!file) return;
  const progress = document.getElementById('upload-progress');
  const bar      = document.getElementById('upload-bar');
  const status   = document.getElementById('upload-status');
  progress.style.display = 'block';
  status.textContent = 'Uploading ' + file.name + '...';
  bar.style.width = '30%';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucket_id', currentBucketId);

  try {
    bar.style.width = '70%';
    const res  = await fetch(API + 'files.php', { method: 'POST', body: formData });
    const data = await res.json();
    bar.style.width = '100%';

    if (data.success) {
      status.textContent = '✓ Uploaded!';
      await logAction('File uploaded', file.name + ' → ' + currentBucketName);
      setTimeout(() => { progress.style.display = 'none'; bar.style.width = '0%'; }, 1500);
      loadFiles();
    } else {
      status.textContent = '✗ Error: ' + data.error;
    }
  } catch (e) {
    status.textContent = '✗ Upload failed';
  }
}

// ── Drag and drop upload ───────────────────────
function handleFileDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) uploadFile(file);
}

// ── Download file ──────────────────────────────
function downloadFile(id) {
  window.open(API + 'download.php?id=' + id, '_blank');
}

// ── Delete file ────────────────────────────────
async function deleteFile(id) {
  if (!confirm('Delete this file?')) return;
  await fetch(API + 'files.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  toast('File deleted');
  await logAction('File deleted', 'File ID: ' + id);
  loadFiles();
}

// ── Preview file ───────────────────────────────
function previewFile(id, name, type) {
  const modal   = document.getElementById('preview-modal');
  const content = document.getElementById('preview-content');
  const title   = document.getElementById('preview-filename');
  title.textContent = name;
  modal.style.display = 'flex';
  const url = API + 'download.php?id=' + id + '&preview=1';

  if (type.startsWith('image/')) {
    content.innerHTML = `<img src="${url}" style="max-width:100%;display:block;margin:auto;padding:16px;">`;
  } else if (type === 'application/pdf') {
    content.innerHTML = `<iframe src="${url}" style="width:100%;height:70vh;border:none;"></iframe>`;
  } else if (type.startsWith('text/')) {
    fetch(url).then(r => r.text()).then(text => {
      content.innerHTML = `<pre style="padding:20px;font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word;">${text.replace(/</g,'&lt;')}</pre>`;
    });
  } else if (type.includes('officedocument') || type.includes('msword') ||
             type.includes('spreadsheet')    || type.includes('presentation')) {
    // Use Google Docs viewer for Office files
    const encoded = encodeURIComponent(window.location.origin + '/cloud-lab/' + API + 'download.php?id=' + id + '&preview=1');
    content.innerHTML = `<iframe src="https://docs.google.com/viewer?url=${encoded}&embedded=true" style="width:100%;height:70vh;border:none;"></iframe>`;
  } else {
    content.innerHTML = `<div style="padding:40px;text-align:center;color:#6b7280;">
      <div style="font-size:48px;margin-bottom:16px;">${iconForFile(type)}</div>
      <p style="font-size:14px;">Preview not available for this file type.</p>
      <button class="btn-primary" style="margin-top:16px;" onclick="downloadFile(${id})">Download instead</button>
    </div>`;
  }
}

// ── Close preview ──────────────────────────────
function closePreview() {
  const modal   = document.getElementById('preview-modal');
  const content = document.getElementById('preview-content');
  modal.style.display = 'none';
  content.innerHTML = '';
}
// ── Monitor charts ─────────────────────────────
async function loadMonitor() {
  const [vmRes, bucketRes] = await Promise.all([
    fetch(API + 'instances.php'),
    fetch(API + 'buckets.php')
  ]);
  const rows    = await vmRes.json();
  const buckets = await bucketRes.json();
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
  } else {
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
      label: v.name, data: cpuHistory[v.id],
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
            scales: { y: { ticks: { callback: v => v + ' GB' } } }
          }
        });
      }
    }
  }

  // ── Billing summary ────────────────────────────
  const HOURS = 730;
  let computeTotal = 0;
  rows.forEach(v => {
    computeTotal += v.status === 'running'
      ? (v.cpu * 0.048 + v.ram * 0.006) * HOURS
      : 0.005 * HOURS;
  });
  const storageTotal = buckets.reduce((s, b) => s + b.size_gb * 0.023, 0);
  const grand        = computeTotal + storageTotal;

  const monitorBill = document.getElementById('monitor-bill');
  if (monitorBill) {
    monitorBill.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:20px;">
        <div class="metric">
          <div class="metric-label">Compute cost</div>
          <div class="metric-val blue">$${computeTotal.toFixed(2)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Storage cost</div>
          <div class="metric-val amber">$${storageTotal.toFixed(2)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Total monthly bill</div>
          <div class="metric-val green">$${grand.toFixed(2)}</div>
        </div>
      </div>`;
  }

  // Auto refresh every 3 seconds
  if (monitorTimer) clearTimeout(monitorTimer);
  monitorTimer = setTimeout(loadMonitor, 3000);
}

function destroyCharts() {
  if (cpuChart)       { cpuChart.destroy();       cpuChart = null; }
  if (storageChart)   { storageChart.destroy();   storageChart = null; }
  if (costDonutChart) { costDonutChart.destroy(); costDonutChart = null; }
  if (costBarChart)   { costBarChart.destroy();   costBarChart = null; }
  if (monitorTimer)   { clearTimeout(monitorTimer); monitorTimer = null; }
}
// ── Init on page load ──────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const name = localStorage.getItem('user_name');
  if (!name) { window.location.href = 'index.html'; return; }
  document.getElementById('user-name').textContent = name;
  loadInstances();
  loadBuckets();
});
// ── Load activity log ──────────────────────────
async function loadLog() {
  const res  = await fetch(API + 'log.php');
  const rows = await res.json();
  const el   = document.getElementById('log-table');
  if (!rows.length) {
    el.innerHTML = '<div class="empty">No activity yet.</div>';
    return;
  }
  el.innerHTML = `
    <div class="table-head" style="grid-template-columns:2fr 2fr 1fr">
      <span>Action</span><span>Details</span><span>Time</span>
    </div>` +
    rows.map(r => {
      const date = new Date(r.created_at);
      const time = date.toLocaleString();
      const icon = iconFor(r.action);
      return `
        <div class="table-row" style="grid-template-columns:2fr 2fr 1fr">
          <span style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px">${icon}</span>
            <b style="font-weight:500">${r.action}</b>
          </span>
          <span style="font-size:12px;color:#6b7280">${r.details || '—'}</span>
          <span style="font-size:11px;color:#9ca3af">${time}</span>
        </div>`;
    }).join('');
}

function iconFor(action) {
  if (action.includes('VM created'))      return '🖥️';
  if (action.includes('VM deleted'))      return '🗑️';
  if (action.includes('VM started'))      return '▶️';
  if (action.includes('VM stopped'))      return '⏹️';
  if (action.includes('Bucket created'))  return '🪣';
  if (action.includes('Bucket deleted'))  return '🗑️';
  if (action.includes('Logged in'))       return '🔐';
  if (action.includes('Logged out'))      return '🚪';
  return '📋';
}
// ── Billing chart state ────────────────────────
let costDonutChart = null;
let costBarChart   = null;

// ── Billing / cost estimator ───────────────────
const RATES = {
  cpuPerHour:     0.048,
  ramPerHour:     0.006,
  stoppedPerHour: 0.005,
  storagePerGB:   0.023,
};
const HOURS_PER_MONTH = 730;

async function loadBilling() {
  const [vmRes, bucketRes] = await Promise.all([
    fetch(API + 'instances.php'),
    fetch(API + 'buckets.php')
  ]);
  const vms     = await vmRes.json();
  const buckets = await bucketRes.json();

  // ── Calculate VM costs ─────────────────────
  let computeTotal = 0;
  const vmRows = vms.map(v => {
    let monthlyCost;
    if (v.status === 'running') {
      monthlyCost = (v.cpu * RATES.cpuPerHour + v.ram * RATES.ramPerHour) * HOURS_PER_MONTH;
    } else {
      monthlyCost = RATES.stoppedPerHour * HOURS_PER_MONTH;
    }
    computeTotal += monthlyCost;
    return { ...v, monthlyCost };
  });

  // ── Calculate bucket costs ─────────────────
  let storageTotal = 0;
  const bucketRows = buckets.map(b => {
    const monthlyCost = b.size_gb * RATES.storagePerGB;
    storageTotal += monthlyCost;
    return { ...b, monthlyCost };
  });

  const grandTotal = computeTotal + storageTotal;

  // ── Update summary cards ───────────────────
  document.getElementById('b-compute').textContent = '$' + computeTotal.toFixed(2);
  document.getElementById('b-storage').textContent = '$' + storageTotal.toFixed(2);
  document.getElementById('b-total').textContent   = '$' + grandTotal.toFixed(2);

  // ── Doughnut chart — compute vs storage ────
  const donutData = {
    labels: ['Compute', 'Storage'],
    datasets: [{
      data: [computeTotal.toFixed(2), storageTotal.toFixed(2)],
      backgroundColor: ['#185FA5', '#BA7517'],
      borderColor: ['#fff', '#fff'],
      borderWidth: 3,
      hoverOffset: 8
    }]
  };

  if (costDonutChart) {
    costDonutChart.data.datasets[0].data = [
      computeTotal.toFixed(2),
      storageTotal.toFixed(2)
    ];
    costDonutChart.update();
  } else {
    costDonutChart = new Chart(
      document.getElementById('cost-donut-chart'), {
        type: 'doughnut',
        data: donutData,
        options: {
          responsive: true,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ' $' + ctx.parsed.toFixed(2)
              }
            }
          }
        }
      }
    );
  }

  // ── Bar chart — cost per instance ──────────
  const barLabels = [
    ...vmRows.map(v => v.name),
    ...bucketRows.map(b => b.bucket_name)
  ];
  const barData = [
    ...vmRows.map(v => v.monthlyCost.toFixed(2)),
    ...bucketRows.map(b => b.monthlyCost.toFixed(2))
  ];
  const barColors = [
    ...vmRows.map(() => '#185FA5'),
    ...bucketRows.map(() => '#BA7517')
  ];

  if (costBarChart) {
    costBarChart.data.labels            = barLabels;
    costBarChart.data.datasets[0].data  = barData;
    costBarChart.data.datasets[0].backgroundColor = barColors;
    costBarChart.update();
  } else {
    costBarChart = new Chart(
      document.getElementById('cost-bar-chart'), {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [{
            label: 'Monthly cost ($)',
            data: barData,
            backgroundColor: barColors,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ' $' + parseFloat(ctx.parsed.y).toFixed(2) + '/mo'
              }
            }
          },
          scales: {
            y: { ticks: { callback: v => '$' + v } },
            x: { ticks: { font: { size: 11 } } }
          }
        }
      }
    );
  }

  // ── Render VM table ────────────────────────
  const vmEl = document.getElementById('billing-vm-table');
  if (!vmRows.length) {
    vmEl.innerHTML = '<div class="empty">No instances yet.</div>';
  } else {
    vmEl.innerHTML = `
      <div class="table-head" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr">
        <span>Instance</span><span>Spec</span><span>Status</span>
        <span>Hourly rate</span><span>Monthly est.</span>
      </div>` +
      vmRows.map(v => {
        const hourly = v.status === 'running'
          ? (v.cpu * RATES.cpuPerHour + v.ram * RATES.ramPerHour).toFixed(4)
          : RATES.stoppedPerHour.toFixed(4);
        const color = v.monthlyCost > 50 ? '#E24B4A' : v.monthlyCost > 20 ? '#BA7517' : '#3B6D11';
        return `
          <div class="table-row" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr">
            <span><b style="font-weight:500">${v.name}</b></span>
            <span style="font-size:12px;color:#6b7280">${v.cpu}vCPU / ${v.ram}GB</span>
            <span><span class="pill ${v.status}">
              <span class="pill-dot"></span>${v.status}
            </span></span>
            <span style="font-size:12px;color:#6b7280">$${hourly}/hr</span>
            <span style="font-weight:600;color:${color}">$${v.monthlyCost.toFixed(2)}</span>
          </div>`;
      }).join('');
  }

  // ── Render bucket table ────────────────────
  const bucketEl = document.getElementById('billing-bucket-table');
  if (!bucketRows.length) {
    bucketEl.innerHTML = '<div class="empty">No buckets yet.</div>';
  } else {
    bucketEl.innerHTML = `
      <div class="table-head" style="grid-template-columns:2fr 1fr 1fr 1fr">
        <span>Bucket</span><span>Size</span><span>Rate</span><span>Monthly est.</span>
      </div>` +
      bucketRows.map(b => {
        const color = b.monthlyCost > 5 ? '#BA7517' : '#3B6D11';
        return `
          <div class="table-row" style="grid-template-columns:2fr 1fr 1fr 1fr">
            <span><b style="font-weight:500">${b.bucket_name}</b>
              <br><span style="font-size:11px;color:#9ca3af">${b.region}</span></span>
            <span style="font-size:13px">${b.size_gb} GB</span>
            <span style="font-size:12px;color:#6b7280">$${RATES.storagePerGB}/GB</span>
            <span style="font-weight:600;color:${color}">$${b.monthlyCost.toFixed(2)}</span>
          </div>`;
      }).join('');
  }
}

