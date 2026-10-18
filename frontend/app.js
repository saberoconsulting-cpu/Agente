const companyId = 'sabero';
const apiBase = import.meta.env.VITE_API_BASE || defaultApiBase();
const authTokenKey = 'sabero_agent_auth_token';

const loginScreen = document.querySelector('#loginScreen');
const loginForm = document.querySelector('#loginForm');
const loginEmail = document.querySelector('#loginEmail');
const loginPassword = document.querySelector('#loginPassword');
const loginButton = document.querySelector('#loginButton');
const loginError = document.querySelector('#loginError');
const logoutButton = document.querySelector('#logoutButton');
const apiStatus = document.querySelector('#apiStatus');
const viewTitle = document.querySelector('#viewTitle');
const metricBackend = document.querySelector('#metricBackend');
const metricFiles = document.querySelector('#metricFiles');
const metricGoogle = document.querySelector('#metricGoogle');
const metricLeads = document.querySelector('#metricLeads');
const metricMeetings = document.querySelector('#metricMeetings');
const pickerNotice = document.querySelector('#pickerNotice');
const filesTable = document.querySelector('#filesTable');
const fileCount = document.querySelector('#fileCount');
const eventsTable = document.querySelector('#eventsTable');
const leadsTable = document.querySelector('#leadsTable');
const leadCount = document.querySelector('#leadCount');
const conversationsTable = document.querySelector('#conversationsTable');
const conversationCount = document.querySelector('#conversationCount');
const logBox = document.querySelector('#log');
const connectGoogle = document.querySelector('#connectGoogle');
const pickFiles = document.querySelector('#pickFiles');
const refreshFiles = document.querySelector('#refreshFiles');
const syncDrive = document.querySelector('#syncDrive');
const clearLog = document.querySelector('#clearLog');
const saveAgentSettings = document.querySelector('#saveAgentSettings');
const agentName = document.querySelector('#agentName');
const agentTone = document.querySelector('#agentTone');
const agentProvider = document.querySelector('#agentProvider');
const agentModel = document.querySelector('#agentModel');
const agentRules = document.querySelector('#agentRules');
const servicesCount = document.querySelector('#servicesCount');
const servicesTable = document.querySelector('#servicesTable');
const serviceName = document.querySelector('#serviceName');
const serviceDescription = document.querySelector('#serviceDescription');
const saveService = document.querySelector('#saveService');
const policiesCount = document.querySelector('#policiesCount');
const policiesTable = document.querySelector('#policiesTable');
const policyKey = document.querySelector('#policyKey');
const policyText = document.querySelector('#policyText');
const savePolicy = document.querySelector('#savePolicy');

let pickerConfig = null;
let tokenClient = null;
let accessToken = null;
let pickerReady = false;
let gisReady = false;
let commercialConfig = { services: [], policies: [] };
let authToken = localStorage.getItem(authTokenKey);

const viewTitles = {
  overview: 'Resumen',
  knowledge: 'Conocimiento',
  agent: 'Agente',
  channels: 'Canales',
  ops: 'Operaciones',
};

function defaultApiBase() {
  if (window.location.port === '5173') return 'http://localhost:3001/api/v1';
  return `${window.location.origin}/api/v1`;
}

function log(message, data) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBox.textContent += `${line}${data ? `\n${JSON.stringify(data, null, 2)}` : ''}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${apiBase}${path}`, {
    headers,
    ...options,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || response.statusText);
  }
  return payload;
}

async function login(email, password) {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || 'No se pudo iniciar sesion');

  authToken = payload.access_token;
  localStorage.setItem(authTokenKey, authToken);
  loginScreen.classList.add('hidden');
  await boot();
}

async function ensureSession() {
  if (!authToken) return false;
  try {
    await request('/auth/me');
    loginScreen.classList.add('hidden');
    return true;
  } catch {
    localStorage.removeItem(authTokenKey);
    authToken = null;
    loginScreen.classList.remove('hidden');
    return false;
  }
}

async function loadStatus() {
  const health = await request('/health');
  apiStatus.textContent = health.ok ? 'Backend activo' : 'Backend no disponible';
  metricBackend.textContent = health.ok ? 'Activo' : 'Error';
}

async function loadDashboard() {
  const summary = await request(`/dashboard/summary?company_id=${companyId}`);
  metricFiles.textContent = String(summary.metrics.indexed_documents);
  metricLeads.textContent = String(summary.metrics.leads);
  metricGoogle.textContent = summary.integrations.google_connected ? 'Conectado' : 'Pendiente';
  metricMeetings.textContent = `${summary.metrics.upcoming_meetings} reunion${summary.metrics.upcoming_meetings === 1 ? '' : 'es'}`;

  if (!summary.recent_events.length) {
    eventsTable.innerHTML = '<tr><td colspan="3" class="empty">Sin eventos todavia.</td></tr>';
    return;
  }

  eventsTable.innerHTML = summary.recent_events
    .map((event) => `
      <tr>
        <td><span class="pill">${escapeHtml(event.event_type)}</span></td>
        <td>${escapeHtml(event.aggregate_type || '-')}${event.aggregate_id ? `<div class="muted">${escapeHtml(event.aggregate_id)}</div>` : ''}</td>
        <td>${formatDate(event.created_at)}</td>
      </tr>
    `)
    .join('');
}

async function loadAgentSettings() {
  const data = await request(`/agent-settings?company_id=${companyId}`);
  const settings = data.settings || {};
  agentName.value = settings.agent_name || '';
  agentTone.value = settings.tone || '';
  agentProvider.value = settings.llm_provider || '';
  agentModel.value = settings.llm_model || '';
  agentRules.value = settings.system_rules || '';
  commercialConfig = {
    services: data.services || [],
    policies: data.policies || [],
  };
  renderServices();
  renderPolicies();
}

async function saveSettings() {
  saveAgentSettings.disabled = true;
  try {
    const saved = await request('/agent-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        company_id: companyId,
        agent_name: agentName.value,
        tone: agentTone.value,
        llm_provider: agentProvider.value,
        llm_model: agentModel.value,
        system_rules: agentRules.value,
      }),
    });
    log('Configuracion del agente guardada', { agent_name: saved.agent_name });
  } finally {
    saveAgentSettings.disabled = false;
  }
}

function renderServices() {
  servicesCount.textContent = `${commercialConfig.services.length} servicio${commercialConfig.services.length === 1 ? '' : 's'}`;
  if (!commercialConfig.services.length) {
    servicesTable.innerHTML = '<tr><td colspan="3" class="empty">Aun no hay servicios configurados.</td></tr>';
    return;
  }

  servicesTable.innerHTML = commercialConfig.services
    .map((service) => `
      <tr>
        <td>
          <div class="doc-name">${escapeHtml(service.name)}</div>
          <div class="muted">${escapeHtml(service.description)}</div>
        </td>
        <td><span class="pill">${service.active ? 'Activo' : 'Inactivo'}</span></td>
        <td><button type="button" class="secondary" data-service-active="${service.id}" data-active="${service.active ? 'false' : 'true'}">${service.active ? 'Pausar' : 'Activar'}</button></td>
      </tr>
    `)
    .join('');
}

function renderPolicies() {
  policiesCount.textContent = `${commercialConfig.policies.length} politica${commercialConfig.policies.length === 1 ? '' : 's'}`;
  if (!commercialConfig.policies.length) {
    policiesTable.innerHTML = '<tr><td colspan="3" class="empty">Aun no hay politicas configuradas.</td></tr>';
    return;
  }

  policiesTable.innerHTML = commercialConfig.policies
    .map((policy) => `
      <tr>
        <td>
          <div class="doc-name">${escapeHtml(policy.policy_key)}</div>
          <div class="muted">${escapeHtml(policy.policy_text)}</div>
        </td>
        <td><span class="pill">${policy.active ? 'Activa' : 'Inactiva'}</span></td>
        <td><button type="button" class="secondary" data-policy-active="${policy.id}" data-active="${policy.active ? 'false' : 'true'}">${policy.active ? 'Pausar' : 'Activar'}</button></td>
      </tr>
    `)
    .join('');
}

async function addService() {
  if (!serviceName.value.trim() || !serviceDescription.value.trim()) {
    log('Completa nombre y descripcion del servicio');
    return;
  }

  saveService.disabled = true;
  try {
    const saved = await request('/agent-settings/services', {
      method: 'POST',
      body: JSON.stringify({
        company_id: companyId,
        name: serviceName.value.trim(),
        description: serviceDescription.value.trim(),
        active: true,
      }),
    });
    log('Servicio guardado', { name: saved.name });
    serviceName.value = '';
    serviceDescription.value = '';
    await loadAgentSettings();
  } finally {
    saveService.disabled = false;
  }
}

async function addPolicy() {
  if (!policyKey.value.trim() || !policyText.value.trim()) {
    log('Completa clave y texto de la politica');
    return;
  }

  savePolicy.disabled = true;
  try {
    const saved = await request('/agent-settings/policies', {
      method: 'POST',
      body: JSON.stringify({
        company_id: companyId,
        policy_key: policyKey.value.trim(),
        policy_text: policyText.value.trim(),
        active: true,
      }),
    });
    log('Politica guardada', { policy_key: saved.policy_key });
    policyKey.value = '';
    policyText.value = '';
    await loadAgentSettings();
  } finally {
    savePolicy.disabled = false;
  }
}

async function toggleService(id, active) {
  await request(`/agent-settings/services/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ company_id: companyId, active }),
  });
  await loadAgentSettings();
}

async function togglePolicy(id, active) {
  await request(`/agent-settings/policies/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ company_id: companyId, active }),
  });
  await loadAgentSettings();
}

async function loadLeads() {
  const leads = await request(`/leads?company_id=${companyId}&limit=20`);
  leadCount.textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'}`;

  if (!leads.length) {
    leadsTable.innerHTML = '<tr><td colspan="4" class="empty">Aun no hay leads registrados.</td></tr>';
    return;
  }

  leadsTable.innerHTML = leads
    .map((lead) => `
      <tr>
        <td>
          <div class="doc-name">${escapeHtml(lead.name || lead.whatsapp_number || 'Sin nombre')}</div>
          <div class="muted">${escapeHtml(lead.id)}</div>
        </td>
        <td><span class="pill">${escapeHtml(lead.status)}</span></td>
        <td>${escapeHtml(formatQualification(lead.qualification))}</td>
        <td>${formatDate(lead.last_message_at || lead.updated_at)}</td>
      </tr>
    `)
    .join('');
}

async function loadConversations() {
  const conversations = await request(`/conversations?company_id=${companyId}&limit=20`);
  conversationCount.textContent = `${conversations.length} conversacion${conversations.length === 1 ? '' : 'es'}`;

  if (!conversations.length) {
    conversationsTable.innerHTML = '<tr><td colspan="4" class="empty">Aun no hay conversaciones.</td></tr>';
    return;
  }

  conversationsTable.innerHTML = conversations
    .map((conversation) => `
      <tr>
        <td>
          <div class="doc-name">${escapeHtml(conversation.lead_name || conversation.whatsapp_number || conversation.external_id)}</div>
          <div class="muted">${escapeHtml(conversation.id)}</div>
        </td>
        <td>${escapeHtml(conversation.channel)}</td>
        <td>${conversation.messages_count}</td>
        <td>${formatDate(conversation.last_message_at || conversation.updated_at)}</td>
      </tr>
    `)
    .join('');
}

async function loadPickerConfig() {
  pickerConfig = await request(`/integrations/google/picker-config?company_id=${companyId}`);
  if (!pickerConfig.enabled) {
    pickerNotice.classList.add('show');
    const missing = [
      pickerConfig.developer_key ? null : 'GOOGLE_PICKER_API_KEY',
      pickerConfig.app_id ? null : 'GOOGLE_APP_ID',
    ].filter(Boolean);
    pickerNotice.textContent = `Picker pendiente: falta ${missing.join(' y ')} en backend/.env. App ID actual: ${pickerConfig.app_id || 'pendiente'}.`;
    pickFiles.disabled = true;
    return;
  }

  pickerNotice.classList.add('show');
  pickerNotice.textContent = 'Google Picker listo para seleccionar PDF, Google Docs y DOCX autorizados.';
  initGoogleClients();
}

function initGoogleClients() {
  const wait = setInterval(() => {
    if (window.google?.accounts?.oauth2 && window.gapi) {
      clearInterval(wait);
      gisReady = true;
      gapi.load('picker', () => {
        pickerReady = true;
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: pickerConfig.client_id,
          scope: pickerConfig.scopes.join(' '),
          callback: (response) => {
            if (response.error) {
              log('Google token error', response);
              return;
            }
            accessToken = response.access_token;
            openPicker();
          },
        });
        pickFiles.disabled = false;
      });
    }
  }, 200);
}

async function loadFiles() {
  const files = await request(`/google-drive/files?company_id=${companyId}`);
  fileCount.textContent = `${files.length} archivo${files.length === 1 ? '' : 's'}`;
  metricFiles.textContent = String(files.length);

  if (!files.length) {
    filesTable.innerHTML = '<tr><td colspan="5" class="empty">No hay archivos autorizados todavia.</td></tr>';
    return;
  }

  filesTable.innerHTML = files
    .map((file) => {
      const link = file.web_view_link
        ? `<a class="doc-link" href="${file.web_view_link}" target="_blank" rel="noreferrer">Abrir en Drive</a>`
        : '';
      return `
        <tr>
          <td><div class="doc-name">${escapeHtml(file.name)}</div>${link}</td>
          <td>${escapeHtml(shortMime(file.mime_type))}</td>
          <td><span class="pill">${escapeHtml(file.sync_status)}</span></td>
          <td>${file.last_synced_at ? new Date(file.last_synced_at).toLocaleString() : '-'}</td>
          <td><button type="button" class="secondary" data-sync="${file.id}">Indexar</button></td>
        </tr>
      `;
    })
    .join('');
}

function requestPickerToken() {
  if (!pickerConfig?.enabled || !gisReady || !pickerReady || !tokenClient) {
    log('Picker todavia no esta listo');
    return;
  }
  tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
}

function openPicker() {
  const view = new google.picker.DocsView()
    .setIncludeFolders(false)
    .setMimeTypes([
      'application/pdf',
      'application/vnd.google-apps.document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].join(','));

  const picker = new google.picker.PickerBuilder()
    .setDeveloperKey(pickerConfig.developer_key)
    .setAppId(pickerConfig.app_id)
    .setOAuthToken(accessToken)
    .setCallback(onPickerSelection)
    .addView(view)
    .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
    .build();

  picker.setVisible(true);
}

async function onPickerSelection(data) {
  if (data.action !== google.picker.Action.PICKED) return;

  for (const doc of data.docs || []) {
    const saved = await request('/google-drive/files', {
      method: 'POST',
      body: JSON.stringify({
        company_id: companyId,
        google_file_id: doc.id,
        name: doc.name,
        mime_type: doc.mimeType,
        web_view_link: doc.url,
      }),
    });
    log('Archivo autorizado registrado', { id: saved.id, name: saved.name });
  }

  await loadFiles();
}

async function syncFile(id, button) {
  button.disabled = true;
  button.textContent = 'Indexando...';
  try {
    const result = await request(`/google-drive/files/${id}/sync?company_id=${companyId}`, {
      method: 'POST',
    });
    log('Archivo indexado', result);
  } finally {
    button.disabled = false;
    button.textContent = 'Indexar';
    await loadFiles();
  }
}

async function syncDriveFiles() {
  syncDrive.disabled = true;
  syncDrive.textContent = 'Sincronizando...';
  try {
    const result = await request(`/google-drive/sync?company_id=${companyId}`, {
      method: 'POST',
    });
    log('Sincronizacion Drive completada', result);
    await loadFiles();
    await loadDashboard();
  } finally {
    syncDrive.disabled = false;
    syncDrive.textContent = 'Sincronizar Drive';
  }
}

function shortMime(mime) {
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'application/vnd.google-apps.document') return 'Google Docs';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
  return mime || '-';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatQualification(value) {
  const entries = Object.entries(value || {});
  if (!entries.length) return 'Pendiente';
  return entries.map(([key]) => key).join(', ');
}

connectGoogle.addEventListener('click', () => {
  window.location.href = `/api/v1/integrations/google/start?company_id=${companyId}`;
});

pickFiles.addEventListener('click', requestPickerToken);
refreshFiles.addEventListener('click', loadFiles);
syncDrive.addEventListener('click', syncDriveFiles);
clearLog.addEventListener('click', () => {
  logBox.textContent = '';
});
logoutButton.addEventListener('click', () => {
  localStorage.removeItem(authTokenKey);
  authToken = null;
  loginScreen.classList.remove('hidden');
});
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginError.textContent = '';
  try {
    await login(loginEmail.value.trim(), loginPassword.value);
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    loginButton.disabled = false;
  }
});
saveAgentSettings.addEventListener('click', saveSettings);
saveService.addEventListener('click', addService);
savePolicy.addEventListener('click', addPolicy);

filesTable.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-sync]');
  if (button) syncFile(button.dataset.sync, button);
});

servicesTable.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-service-active]');
  if (button) toggleService(button.dataset.serviceActive, button.dataset.active === 'true');
});

policiesTable.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-policy-active]');
  if (button) togglePolicy(button.dataset.policyActive, button.dataset.active === 'true');
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.view').forEach((section) => section.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`#view-${view}`).classList.add('active');
    viewTitle.textContent = viewTitles[view] || 'Panel';
  });
});

async function boot() {
  pickFiles.disabled = true;
  try {
    await loadStatus();
    await loadPickerConfig();
    await loadDashboard();
    await loadFiles();
    await loadAgentSettings();
    await loadLeads();
    await loadConversations();
    log('Panel listo');
  } catch (error) {
    apiStatus.textContent = 'Error';
    log('Error inicializando panel', { message: error.message });
  }
}

async function start() {
  const active = await ensureSession();
  if (active) await boot();
}

void start();
