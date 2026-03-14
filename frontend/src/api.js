const API_BASE = '';

export function getToken() {
  return localStorage.getItem('c463_token');
}

export function getUser() {
  const u = localStorage.getItem('c463_user');
  return u ? JSON.parse(u) : null;
}

export function setAuth(token, user) {
  localStorage.setItem('c463_token', token);
  localStorage.setItem('c463_user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('c463_token');
  localStorage.removeItem('c463_user');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

// Auth
export const login = (usuario, password) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ usuario, password }) });

// Chats
export const getChats = (params = '') => apiFetch(`/api/chat/chats${params ? '?' + params : ''}`);
export const createChat = (data) => apiFetch('/api/chat/chats', { method: 'POST', body: JSON.stringify(data) });
export const getChatMessages = (id) => apiFetch(`/api/chat/chats/${id}/messages`);
export const sendChatMessage = (id, data) => apiFetch(`/api/chat/chats/${id}/messages`, { method: 'POST', body: JSON.stringify(data) });
export const resolveChat = (id) => apiFetch(`/api/chat/chats/${id}/resolve`, { method: 'POST' });
export const markChatRead = (id) => apiFetch(`/api/chat/chats/${id}/read`, { method: 'POST' });
export const archiveChat = (id) => apiFetch(`/api/chat/chats/${id}/archive`, { method: 'POST' });
export const addChatLabel = (id, labelId) => apiFetch(`/api/chat/chats/${id}/label`, { method: 'POST', body: JSON.stringify({ labelId, action: 'add' }) });
export const removeChatLabel = (id, labelId) => apiFetch(`/api/chat/chats/${id}/label`, { method: 'POST', body: JSON.stringify({ labelId, action: 'remove' }) });
export const getChatLabels = () => apiFetch('/api/chat/labels');
export const getChatStats = () => apiFetch('/api/chat/stats');

// Users
export const getUsers = () => apiFetch('/api/admin/users');
export const createUser = (data) => apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
export const updateUser = (id, data) => apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteUser = (id) => apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });

// Clients
export const getClients = () => apiFetch('/api/admin/clients');
export const createClient = (data) => apiFetch('/api/admin/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id, data) => apiFetch(`/api/admin/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClient = (id) => apiFetch(`/api/admin/clients/${id}`, { method: 'DELETE' });

// Commands
export const getCommands = () => apiFetch('/api/admin/commands');
export const createCommand = (data) => apiFetch('/api/admin/commands', { method: 'POST', body: JSON.stringify(data) });
export const updateCommand = (id, data) => apiFetch(`/api/admin/commands/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCommand = (id) => apiFetch(`/api/admin/commands/${id}`, { method: 'DELETE' });

// Auto Messages
export const getAutoMessages = () => apiFetch('/api/admin/auto-messages');
export const createAutoMessage = (data) => apiFetch('/api/admin/auto-messages', { method: 'POST', body: JSON.stringify(data) });
export const updateAutoMessage = (id, data) => apiFetch(`/api/admin/auto-messages/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAutoMessage = (id) => apiFetch(`/api/admin/auto-messages/${id}`, { method: 'DELETE' });

// API Config
export const getApiConfig = () => apiFetch('/api/admin/api-config');
export const updateApiConfig = (section, data) => apiFetch(`/api/admin/api-config/${section}`, { method: 'PUT', body: JSON.stringify(data) });

// Accounts
export const getAccounts = () => apiFetch('/api/admin/accounts');
export const createAccount = (data) => apiFetch('/api/admin/accounts', { method: 'POST', body: JSON.stringify(data) });
export const updateAccount = (id, data) => apiFetch(`/api/admin/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAccount = (id) => apiFetch(`/api/admin/accounts/${id}`, { method: 'DELETE' });

// Settings
export const getSettings = () => apiFetch('/api/admin/settings');
export const updateSettings = (data) => apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify(data) });

// Platform Token
export const getProcessingMode = () => apiFetch('/api/admin/platform-token/processing-mode');
export const updateProcessingMode = (mode) => apiFetch('/api/admin/platform-token/processing-mode', { method: 'PUT', body: JSON.stringify({ mode }) });

// Payments
export const getPayments = () => apiFetch('/api/admin/payments');
export const getPendingPayments = () => apiFetch('/api/admin/payments/pending');
export const getPaymentStats = () => apiFetch('/api/admin/payments/stats');
export const getPaymentsByChat = (chatId) => apiFetch(`/api/admin/payments/chat/${chatId}`);
export const getPaymentsByClient = (clientId) => apiFetch(`/api/admin/payments/client/${clientId}`);
export const getPaymentById = (id) => apiFetch(`/api/admin/payments/${id}`);
export const createPayment = (data) => apiFetch('/api/admin/payments', { method: 'POST', body: JSON.stringify(data) });
export const updatePayment = (id, data) => apiFetch(`/api/admin/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const approvePayment = (id, data) => apiFetch(`/api/admin/payments/${id}/approve`, { method: 'POST', body: JSON.stringify(data) });
export const rejectPayment = (id, data) => apiFetch(`/api/admin/payments/${id}/reject`, { method: 'POST', body: JSON.stringify(data) });
export const checkDuplicatePayment = (imageHash) => apiFetch('/api/admin/payments/check-duplicate', { method: 'POST', body: JSON.stringify({ imageHash }) });

// Chat Automation
export const updateChatState = (id, state) => apiFetch(`/api/chat/chats/${id}/state`, { method: 'PUT', body: JSON.stringify({ state }) });
export const enableChatOptions = (id) => apiFetch(`/api/chat/chats/${id}/enable-options`, { method: 'POST' });
export const updateChatTags = (id, tags) => apiFetch(`/api/chat/chats/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });
export const updateChatNota = (id, nota) => apiFetch(`/api/chat/chats/${id}/nota`, { method: 'PUT', body: JSON.stringify({ nota }) });
export const getChatPayments = (id) => apiFetch(`/api/chat/chats/${id}/payments`);
export const sendAutoMessage = (id, tipo, variables = {}) => apiFetch(`/api/chat/chats/${id}/auto-message`, { method: 'POST', body: JSON.stringify({ tipo, variables }) });
export const transferChat = (id, adminId) => apiFetch(`/api/chat/chats/${id}/transfer`, { method: 'POST', body: JSON.stringify({ adminId }) });

// Modal Config
export const getModalConfig = () => apiFetch('/api/admin/modal');
export const updateModalConfig = (data) => apiFetch('/api/admin/modal', { method: 'PUT', body: JSON.stringify(data) });

// Button Options
export const getButtonOptions = () => apiFetch('/api/admin/options');
export const updateButtonOptions = (data) => apiFetch('/api/admin/options', { method: 'PUT', body: JSON.stringify(data) });

// Amounts
export const getAmounts = () => apiFetch('/api/admin/amounts');
export const updateAmounts = (data) => apiFetch('/api/admin/amounts', { method: 'PUT', body: JSON.stringify(data) });

// Labels
export const getLabels = () => apiFetch('/api/admin/labels');
export const createLabel = (data) => apiFetch('/api/admin/labels', { method: 'POST', body: JSON.stringify(data) });
export const updateLabel = (id, data) => apiFetch(`/api/admin/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLabel = (id) => apiFetch(`/api/admin/labels/${id}`, { method: 'DELETE' });

// Push Notifications
export const sendPushNotification = (data) => apiFetch('/api/notifications/send', { method: 'POST', body: JSON.stringify(data) });
export const getNotificationHistory = () => apiFetch('/api/notifications/history');
export const getNotificationSubscriptions = () => apiFetch('/api/notifications/subscriptions');

// Popups
export const sendPopup = (data) => apiFetch('/api/notifications/popups/send', { method: 'POST', body: JSON.stringify(data) });
export const getPopupHistory = () => apiFetch('/api/notifications/popups');

// Popup Templates
export const getPopupTemplates = () => apiFetch('/api/notifications/popups/templates');
export const createPopupTemplate = (data) => apiFetch('/api/notifications/popups/templates', { method: 'POST', body: JSON.stringify(data) });
export const updatePopupTemplate = (id, data) => apiFetch(`/api/notifications/popups/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePopupTemplate = (id) => apiFetch(`/api/notifications/popups/templates/${id}`, { method: 'DELETE' });

// Events
export const getEvents = () => apiFetch('/api/admin/events');
export const getEventById = (id) => apiFetch(`/api/admin/events/${id}`);
export const createEvent = (data) => apiFetch('/api/admin/events', { method: 'POST', body: JSON.stringify(data) });
export const updateEvent = (id, data) => apiFetch(`/api/admin/events/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEvent = (id) => apiFetch(`/api/admin/events/${id}`, { method: 'DELETE' });
export const startEvent = (id) => apiFetch(`/api/admin/events/${id}/start`, { method: 'POST' });
export const endEvent = (id) => apiFetch(`/api/admin/events/${id}/end`, { method: 'POST' });
export const drawEventWinner = (id) => apiFetch(`/api/admin/events/${id}/draw`, { method: 'POST' });
export const claimEventPrize = (id) => apiFetch(`/api/admin/events/${id}/claim`, { method: 'POST' });

// Quizzes
export const getQuizzes = () => apiFetch('/api/admin/quizzes');
export const getQuizById = (id) => apiFetch(`/api/admin/quizzes/${id}`);
export const createQuiz = (data) => apiFetch('/api/admin/quizzes', { method: 'POST', body: JSON.stringify(data) });
export const updateQuiz = (id, data) => apiFetch(`/api/admin/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteQuiz = (id) => apiFetch(`/api/admin/quizzes/${id}`, { method: 'DELETE' });
export const startQuiz = (id) => apiFetch(`/api/admin/quizzes/${id}/start`, { method: 'POST' });
export const endQuiz = (id) => apiFetch(`/api/admin/quizzes/${id}/end`, { method: 'POST' });

// Scratch Cards (Raspa y Gana)
export const getScratchCards = () => apiFetch('/api/admin/scratch-cards');
export const getScratchCardById = (id) => apiFetch(`/api/admin/scratch-cards/${id}`);
export const createScratchCard = (data) => apiFetch('/api/admin/scratch-cards', { method: 'POST', body: JSON.stringify(data) });
export const deleteScratchCard = (id) => apiFetch(`/api/admin/scratch-cards/${id}`, { method: 'DELETE' });
export const startScratchCard = (id) => apiFetch(`/api/admin/scratch-cards/${id}/start`, { method: 'POST' });
export const endScratchCard = (id) => apiFetch(`/api/admin/scratch-cards/${id}/end`, { method: 'POST' });

// Roulettes (Ruleta)
export const getRoulettes = () => apiFetch('/api/admin/roulettes');
export const getRouletteById = (id) => apiFetch(`/api/admin/roulettes/${id}`);
export const createRoulette = (data) => apiFetch('/api/admin/roulettes', { method: 'POST', body: JSON.stringify(data) });
export const deleteRoulette = (id) => apiFetch(`/api/admin/roulettes/${id}`, { method: 'DELETE' });
export const startRoulette = (id) => apiFetch(`/api/admin/roulettes/${id}/start`, { method: 'POST' });
export const endRoulette = (id) => apiFetch(`/api/admin/roulettes/${id}/end`, { method: 'POST' });

// Missions (Misiones)
export const getMissions = () => apiFetch('/api/admin/missions');
export const getMissionById = (id) => apiFetch(`/api/admin/missions/${id}`);
export const createMission = (data) => apiFetch('/api/admin/missions', { method: 'POST', body: JSON.stringify(data) });
export const updateMission = (id, data) => apiFetch(`/api/admin/missions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMission = (id) => apiFetch(`/api/admin/missions/${id}`, { method: 'DELETE' });

// Activity Feed
export const getActivityFeed = (limit = 50) => apiFetch(`/api/admin/activity-feed?limit=${limit}`);

// Analytics
export const getAnalyticsOverview = () => apiFetch('/api/analytics/overview');
export const getAnalyticsActiveUsers = (from, to, period = 'day') => apiFetch(`/api/analytics/active-users?from=${from}&to=${to}&period=${period}`);
export const getAnalyticsTopUsers = (limit = 10, metric = 'activity', from, to) => apiFetch(`/api/analytics/users?limit=${limit}&metric=${metric}&from=${from}&to=${to}`);
export const getAnalyticsUserDetail = (clientId) => apiFetch(`/api/analytics/users/${clientId}`);
export const getAnalyticsFinancial = (from, to, period = 'day') => apiFetch(`/api/analytics/financial?from=${from}&to=${to}&period=${period}`);
export const getAnalyticsRetention = () => apiFetch('/api/analytics/retention');
export const getAnalyticsFunnel = () => apiFetch('/api/analytics/funnel');
export const getAnalyticsSegments = () => apiFetch('/api/analytics/segments');
export const getAnalyticsPeakHours = (from, to) => apiFetch(`/api/analytics/peak-hours?from=${from}&to=${to}`);
export const getAnalyticsEngagement = (from, to) => apiFetch(`/api/analytics/engagement?from=${from}&to=${to}`);
export const getAnalyticsSessions = (from, to) => apiFetch(`/api/analytics/sessions?from=${from}&to=${to}`);
export const getPushTrackingStats = () => apiFetch('/api/notifications/tracking-stats');

// Casino 463.life API
export const casinoTestConnection = (data) => apiFetch('/api/admin/casino/test-connection', { method: 'POST', body: JSON.stringify(data || {}) });
export const casinoLogin = () => apiFetch('/api/admin/casino/login', { method: 'POST' });
export const casinoCreateUser = (nombre, telefono) => apiFetch('/api/admin/casino/create-user', { method: 'POST', body: JSON.stringify({ nombre, telefono }) });
export const casinoDeposit = (username, amount) => apiFetch('/api/admin/casino/deposit', { method: 'POST', body: JSON.stringify({ username, amount }) });
export const casinoWithdraw = (username, amount) => apiFetch('/api/admin/casino/withdraw', { method: 'POST', body: JSON.stringify({ username, amount }) });
export const casinoGetBalance = (username) => apiFetch(`/api/admin/casino/balance/${username}`);
export const casinoGetPlayers = () => apiFetch('/api/admin/casino/players');
export const casinoUserExists = (username) => apiFetch(`/api/admin/casino/user-exists/${username}`);

// Palta Wallet
export const getPaltaStatus = () => apiFetch('/api/palta/status');
export const getPaltaConfig = () => apiFetch('/api/palta/config');
export const updatePaltaConfig = (data) => apiFetch('/api/palta/config', { method: 'PUT', body: JSON.stringify(data) });
export const startPalta = () => apiFetch('/api/palta/start', { method: 'POST' });
export const stopPalta = () => apiFetch('/api/palta/stop', { method: 'POST' });
export const startPaltaPolling = () => apiFetch('/api/palta/polling/start', { method: 'POST' });
export const stopPaltaPolling = () => apiFetch('/api/palta/polling/stop', { method: 'POST' });
export const triggerPaltaPoll = () => apiFetch('/api/palta/poll', { method: 'POST' });
export const getPaltaTransactions = (limit = 100) => apiFetch(`/api/palta/transactions?limit=${limit}`);
export const getPaltaUnmatched = () => apiFetch('/api/palta/transactions/unmatched');
export const matchPaltaTransaction = (txId, paymentId, autoApprove = false) => apiFetch(`/api/palta/transactions/${txId}/match`, { method: 'POST', body: JSON.stringify({ paymentId, autoApprove }) });
export const getPaltaSuggestions = () => apiFetch('/api/palta/suggestions');
export const getPaltaStats = () => apiFetch('/api/palta/stats');
export const testPaltaConnection = () => apiFetch('/api/palta/test', { method: 'POST' });

// Push Automation
export const getPushAutomationConfig = () => apiFetch('/api/push-automation/config').then(r => r.data || r);
export const savePushAutomationConfig = (data) => apiFetch('/api/push-automation/config/all', { method: 'PUT', body: JSON.stringify(data) });
export const getPushAutomationStatus = () => apiFetch('/api/push-automation/status').then(r => r.data || r);
export const getPushSubscribersStats = () => apiFetch('/api/push-automation/push-subscribers-stats');
export const startPushAutomation = () => apiFetch('/api/push-automation/start', { method: 'POST' });
export const stopPushAutomation = () => apiFetch('/api/push-automation/stop', { method: 'POST' });
export const getPushAutomationStats = () => apiFetch('/api/push-automation/stats').then(r => r.data || r);
