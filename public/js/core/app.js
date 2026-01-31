// API endpoints
        const API_BASE = '/api';
        const DEFAULT_LOGO_URL = '/images/logo.png';
        const API_ENDPOINTS = {
            LOGIN: `${API_BASE}/login`,
            CELLS: `${API_BASE}/cells`,
            MEMBERS: `${API_BASE}/members`,
            REPORTS: `${API_BASE}/reports`,
            USERS: `${API_BASE}/users`,
            SESSIONS: `${API_BASE}/sessions`,
            HEALTH: `${API_BASE}/health`,
            FIRST_TIMERS: `${API_BASE}/first-timers`,
            FOLLOW_UPS: `${API_BASE}/follow-ups`,
            SETTINGS_LOGO: `${API_BASE}/settings/logo`,
            NOTIFICATIONS: `${API_BASE}/notifications`
        };

        // Data storage for frontend cache
        const churchData = {
            cells: [],
            reports: [],
            members: [],
            users: [],
            sessions: [],
            firstTimers: [],
            followUps: [],
            notifications: [],
            pageMeta: {},
            currentUser: null,
            settings: {
                theme: 'light',
                logo: DEFAULT_LOGO_URL,
                logoTitle: 'Christ Embassy',
                logoSubtitle: 'Church Cell Data'
            },
            currentYear: new Date().getFullYear()
        };


        const PAGE_SIZE = 20;
        const paginationState = {
            cells: 1,
            members: 1,
            access: 1,
            pageManagement: 1,
            sessions: 1,
            cellMembers: {}
        };

        function getTotalPages(totalItems) {
            return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
        }

        function clampPage(page, totalPages) {
            return Math.min(Math.max(page, 1), totalPages);
        }

        function renderPagination(containerId, page, totalPages, onChange) {
            const container = document.getElementById(containerId);
            if (!container) return;

            if (totalPages <= 1) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = `
                <button class="btn btn-secondary" ${page <= 1 ? 'disabled' : ''} data-page="prev">Prev</button>
                <span class="page-info">Page ${page} of ${totalPages}</span>
                <button class="btn btn-secondary" ${page >= totalPages ? 'disabled' : ''} data-page="next">Next</button>
            `;

            const prevBtn = container.querySelector('[data-page="prev"]');
            const nextBtn = container.querySelector('[data-page="next"]');

            prevBtn?.addEventListener('click', () => onChange(page - 1));
            nextBtn?.addEventListener('click', () => onChange(page + 1));
        }


        // Idle timeout variables
        let idleTimer = null;
        let idleModalTimer = null;
        let idleCountdown = 30;
        let lastActivityTime = Date.now();
        const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
        const IDLE_MODAL_TIMEOUT = 30 * 1000; // 30 seconds
        let sessionActiveMs = 0;
        let sessionIdleMs = 0;
        let sessionLastTick = Date.now();
        let sessionIdle = false;
        let sessionSyncTimer = null;
        let notificationsPollTimer = null;

        // DOM elements
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const sidebar = document.getElementById('sidebar');
        const statsContainer = document.getElementById('statsContainer');
        const cellsTableBody = document.getElementById('cellsTableBody');
        const recentReports = document.getElementById('recentReports');
        const themeOptions = document.querySelectorAll('.theme-option');
        const cellGroupsContainer = document.getElementById('cellGroupsContainer');
        const dynamicCellPages = document.getElementById('dynamicCellPages');
        let currentDeleteCallback = null;

        // Get authorization headers
        function getAuthHeaders() {
            const token = localStorage.getItem('token');
            return {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };
        }

        // API request helper
        async function apiRequest(endpoint, options = {}) {
            try {
                const response = await fetch(endpoint, {
                    ...options,
                    headers: {
                        ...getAuthHeaders(),
                        ...options.headers
                    }
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        // Token expired or invalid
                        localStorage.removeItem('token');
                        localStorage.removeItem('role');
                        localStorage.removeItem('username');
                        document.body.classList.add('login-active');
                        document.getElementById('loginModal').classList.add('active');
                        throw new Error('Session expired. Please login again.');
                    }
                    
                    const error = await response.json();
                    throw new Error(error.error || 'Request failed');
                }

                return await response.json();
            } catch (error) {
                console.error('API request failed:', error);
                throw error;
            }
        }

        // Load all data from backend
        async function loadAllData() {
            try {
                // Load cells
                const cellsData = await apiRequest(API_ENDPOINTS.CELLS);
                churchData.cells = cellsData;
                
                // Load members
                const membersData = await apiRequest(API_ENDPOINTS.MEMBERS);
                churchData.members = membersData;
                
                // Load reports
                const reportsData = await apiRequest(API_ENDPOINTS.REPORTS);
                churchData.reports = reportsData;

                // Load first-timers
                try {
                    const firstTimersData = await apiRequest(API_ENDPOINTS.FIRST_TIMERS);
                    churchData.firstTimers = firstTimersData;
                } catch (error) {
                    console.warn('Failed to load first-timers:', error.message);
                }

                // Load follow-ups
                try {
                    const followUpsData = await apiRequest(API_ENDPOINTS.FOLLOW_UPS);
                    churchData.followUps = followUpsData;
                } catch (error) {
                    console.warn('Failed to load follow-ups:', error.message);
                }

                // Load notifications
                try {
                    const notificationsData = await apiRequest(API_ENDPOINTS.NOTIFICATIONS);
                    churchData.notifications = notificationsData;
                } catch (error) {
                    console.warn('Failed to load notifications:', error.message);
                }

                // Load sessions (admin only)
                try {
                    const sessionsData = await apiRequest(API_ENDPOINTS.SESSIONS);
                    churchData.sessions = sessionsData;
                } catch (error) {
                    if (error.message !== 'Not authorized') {
                        console.warn('Failed to load sessions:', error.message);
                    }
                }
                
                // Load users (admin only)
                try {
                    const usersData = await apiRequest(API_ENDPOINTS.USERS);
                    churchData.users = usersData;
                } catch (error) {
                    if (error.message !== 'Not authorized') {
                        console.warn('Failed to load users:', error.message);
                    }
                }
                
                // Update UI
                updateAllUI();
                
                // Create cell pages for all cells
                churchData.cells.forEach(cell => {
                    createCellPage(cell);
                });
                
                return true;
            } catch (error) {
                console.error('Failed to load data:', error);
                alert('Failed to load data from server');
                return false;
            }
        }

        // Initialize application
        function initializeApplication() {
            // Set current year in footer
            document.getElementById('currentYear').textContent = churchData.currentYear;
            
            // Update logo text from settings
            document.getElementById('logoTitleText').textContent = churchData.settings.logoTitle;
            document.getElementById('logoSubtitleText').textContent = churchData.settings.logoSubtitle;
            document.getElementById('loginTitle').textContent = `Welcome to ${churchData.settings.logoTitle}`;
            document.getElementById('loginSubtitle').textContent = churchData.settings.logoSubtitle;
            document.getElementById('logoTitle').value = churchData.settings.logoTitle;
            document.getElementById('logoSubtitle').value = churchData.settings.logoSubtitle;
            
            const savedLogo = localStorage.getItem('logoImage');
            if (savedLogo) {
                churchData.settings.logo = savedLogo;
            } else {
                churchData.settings.logo = DEFAULT_LOGO_URL;
            }

            // Update login modal logo
            updateLoginLogo();
            updateSidebarLogo();
            
            // Check if user is already logged in
            const token = localStorage.getItem('token');
            const role = localStorage.getItem('role');
            const username = localStorage.getItem('username');
            const restrictedMenus = (() => {
                try {
                    return JSON.parse(localStorage.getItem('restrictedMenus') || '[]');
                } catch {
                    return [];
                }
            })();
            
            if (token && role && username) {
                churchData.currentUser = {
                    username: username,
                    role: role,
                    token: token,
                    restrictedMenus: restrictedMenus
                };
                
                document.body.classList.remove('login-active');
                document.getElementById('loginModal').classList.remove('active');
                
                // Load data and update UI
                loadAllData().then(() => {
                    updateAllUI();
                    applyUserPermissions();
                    
                    if (role === 'superuser' || role === 'admin') {
                        restoreActivePage('dashboard');
                    } else {
                        restoreActivePage('members');
                    }
                });
                
                // Reset idle timer
                resetIdleTimer();
            }
        }

        // Update all UI components
        function updateAllUI() {
            updateStats();
            updateCellsTable();
            updateRecentReports();
            updateSidebarMenus();
            updateAllMembersTable();
            updateNotificationsUI();
            updateNotificationsTable();
            populateNotificationRoles();
            if (typeof updateFirstTimersTable === 'function') {
                updateFirstTimersTable();
            }
            if (typeof updateFollowUpsTable === 'function') {
                updateFollowUpsTable();
            }
            updateAccessManagementTable();
            updatePageManagementTable();
            updateSessionsTable();
        }

        // Update statistics
        

        // View active cells
        

        // View inactive cells
        

        // View all cells
        

        // View all members
        

        
        // Update cells table
        


  

  

  

  

  // Update recent reports
        

        // Helper function to get meeting type text
        

        // Update sidebar menus
        

        function showToast(message) {
            let toast = document.getElementById('appToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'appToast';
                toast.className = 'toast';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.classList.add('show');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => {
                toast.classList.remove('show');
            }, 2000);
        }

        // Apply user permissions
        function applyUserPermissions() {
            const currentUser = churchData.currentUser;
            if (!currentUser) return;
            
            const allNavItems = document.querySelectorAll('.nav-item');
            const restricted = new Set(currentUser.restrictedMenus || []);
            
            allNavItems.forEach(navItem => {
                const pageId = navItem.getAttribute('data-page');
                
                // Show/hide based on role
                if (currentUser.role === 'member') {
                    // Members can only see dashboard and members page
                    if (pageId !== 'dashboard' && pageId !== 'members' && pageId !== 'notifications' && !pageId.startsWith('cell-')) {
                        navItem.style.display = 'none';
                    } else {
                        navItem.style.display = 'flex';
                    }
                } else {
                    navItem.style.display = 'flex';
                }

                if (pageId && restricted.has(pageId)) {
                    navItem.style.display = 'none';
                }
            });

            document.querySelectorAll('.page-content').forEach(page => {
                const pageId = page.id;
                if (pageId && restricted.has(pageId)) {
                    page.style.display = 'none';
                } else {
                    page.style.display = '';
                }
            });

            const sendTabBtn = document.getElementById('notificationsSendTabBtn');
            const sendTab = document.getElementById('notificationsSendTab');
            if (currentUser.role === 'superuser' || currentUser.role === 'admin') {
                if (sendTabBtn) sendTabBtn.style.display = '';
            } else {
                if (sendTabBtn) sendTabBtn.style.display = 'none';
                if (sendTab && sendTab.classList.contains('active')) {
                    sendTab.classList.remove('active');
                    document.getElementById('notificationsListTab')?.classList.add('active');
                    document.querySelector('#notificationsTabs .cell-tab-btn')?.classList.add('active');
                }
            }
        }

        // Create cell page
        

        // Populate year filter
        

        // Search reports
        

        // Display filtered reports
        

        
        // Update cell members table
        


        
        // Update all members table (new function)
        


        

        // Search members function
        

        

        

        

        

        

        

        

        

        

        

        
        


        
        


        

        

        

        

        

        

        // Edit member
        

        // Save edited member
        

        // Confirm delete member
        

        // Delete member
        

        function loadNotificationsFromStorage() {
            try {
                const stored = JSON.parse(localStorage.getItem('notifications') || '[]');
                if (Array.isArray(stored)) {
                    churchData.notifications = stored;
                }
            } catch {
                churchData.notifications = [];
            }
        }

        function saveNotificationsToStorage() {
            localStorage.setItem('notifications', JSON.stringify(churchData.notifications));
        }

        function updateNotificationsUI() {
            const unread = churchData.notifications.filter(n => !n.readAt);
            const badge = document.getElementById('notificationsBadge');
            const list = document.getElementById('notificationsList');
            if (badge) {
                badge.textContent = unread.length;
                badge.style.display = unread.length ? 'inline-flex' : 'none';
            }
            if (!list) return;

            if (!unread.length) {
                list.innerHTML = `<div class="notification-empty">No unread notifications.</div>`;
                return;
            }

            list.innerHTML = '';
            unread.forEach(note => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'notification-item';
                item.innerHTML = `
                    <div class="notification-item-title">${note.title || 'Notification'}</div>
                    <div class="notification-item-text">${note.message || ''}</div>
                `;
                item.addEventListener('click', () => openNotificationModal(note.id));
                list.appendChild(item);
            });
        }

        function updateNotificationsTable() {
            const tbody = document.getElementById('notificationsTableBody');
            if (!tbody) return;

            if (!churchData.notifications.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align:center; padding: 24px; color: var(--gray-color);">
                            No notifications yet.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = '';
            churchData.notifications.forEach(note => {
                const created = note.createdAt ? new Date(note.createdAt).toLocaleString() : '';
                const status = note.readAt ? 'Read' : 'Unread';
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td data-label="Title">${note.title || ''}</td>
                    <td data-label="Message">${note.message || ''}</td>
                    <td data-label="Status">${status}</td>
                    <td data-label="Created">${created}</td>
                `;
                row.addEventListener('click', () => openNotificationModal(note.id));
                tbody.appendChild(row);
            });
        }

        async function fetchNotifications() {
            try {
                const data = await apiRequest(API_ENDPOINTS.NOTIFICATIONS);
                churchData.notifications = data;
                saveNotificationsToStorage();
                updateNotificationsUI();
                updateNotificationsTable();
            } catch (error) {
                console.warn('Failed to load notifications:', error.message);
            }
        }

        function refreshNotificationsSilently() {
            if (!localStorage.getItem('token')) return;
            fetchNotifications();
        }

        function updateNotificationsTabs() {
            const tabs = document.getElementById('notificationsTabs');
            const listTab = document.getElementById('notificationsListTab');
            const sendTab = document.getElementById('notificationsSendTab');
            if (!tabs || !listTab || !sendTab) return;

            const buttons = tabs.querySelectorAll('.cell-tab-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const tab = btn.getAttribute('data-tab');
                    if (tab === 'send') {
                        listTab.classList.remove('active');
                        sendTab.classList.add('active');
                    } else {
                        sendTab.classList.remove('active');
                        listTab.classList.add('active');
                    }
                });
            });
        }

        function getSelectedValues(selectEl) {
            if (!selectEl) return [];
            return Array.from(selectEl.selectedOptions)
                .map(option => option.value)
                .filter(Boolean);
        }

        function populateNotificationRoles() {
            const rolesSelect = document.getElementById('notificationTargetRoles');
            if (!rolesSelect) return;

            const selected = new Set(getSelectedValues(rolesSelect));
            const memberRoles = churchData.members.map(m => m.role).filter(Boolean);
            const userRoles = churchData.users.map(u => u.role).filter(Boolean);
            const roles = Array.from(new Set([...memberRoles, ...userRoles]))
                .sort((a, b) => a.localeCompare(b));

            rolesSelect.innerHTML = '';
            if (!roles.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No roles found';
                opt.disabled = true;
                rolesSelect.appendChild(opt);
                rolesSelect.disabled = true;
            } else {
                rolesSelect.disabled = false;
                roles.forEach(role => {
                    const opt = document.createElement('option');
                    opt.value = role;
                    opt.textContent = role;
                    if (selected.has(role)) opt.selected = true;
                    rolesSelect.appendChild(opt);
                });
            }

            populateNotificationTargets(getSelectedValues(rolesSelect));
        }

        function populateNotificationTargets(selectedRoles = []) {
            const targetSelect = document.getElementById('notificationTargetValue');
            if (!targetSelect) return;

            const selected = new Set(getSelectedValues(targetSelect));
            targetSelect.innerHTML = '';

            if (!selectedRoles.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Select role(s) first';
                opt.disabled = true;
                targetSelect.appendChild(opt);
                targetSelect.disabled = true;
                return;
            }

            const recipients = new Map();
            const cellMap = new Map(churchData.cells.map(cell => [cell.id, cell.name]));
            const usersByEmail = new Map(
                churchData.users
                    .filter(user => user.email)
                    .map(user => [user.email.toLowerCase(), user])
            );

            churchData.users.forEach(user => {
                if (selectedRoles.includes(user.role)) {
                    recipients.set(String(user.id), `${user.username} (${user.role})`);
                }
            });

            churchData.members.forEach(member => {
                if (!selectedRoles.includes(member.role)) return;
                if (!member.email) return;
                const user = usersByEmail.get(member.email.toLowerCase());
                if (!user) return;
                const cellName = cellMap.get(member.cellId) || 'No Cell';
                recipients.set(String(user.id), `${member.name} — ${cellName} (${member.role})`);
            });

            if (!recipients.size) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No recipients found for selected roles';
                opt.disabled = true;
                targetSelect.appendChild(opt);
                targetSelect.disabled = true;
                return;
            }

            recipients.forEach((label, userId) => {
                const opt = document.createElement('option');
                opt.value = userId;
                opt.textContent = label;
                if (selected.has(userId)) opt.selected = true;
                targetSelect.appendChild(opt);
            });
            targetSelect.disabled = false;
        }

        async function sendNotification(e) {
            e.preventDefault();
            const roles = getSelectedValues(document.getElementById('notificationTargetRoles'));
            const targetIds = getSelectedValues(document.getElementById('notificationTargetValue'));
            const title = document.getElementById('notificationTitle').value.trim();
            const message = document.getElementById('notificationMessage').value.trim();
            const type = document.getElementById('notificationType').value;

            if (!roles.length || !targetIds.length || !title || !message) {
                alert('Please complete all required fields.');
                return;
            }

            try {
                await apiRequest(`${API_ENDPOINTS.NOTIFICATIONS}/send`, {
                    method: 'POST',
                    body: JSON.stringify({ roles, targetIds, title, message, type })
                });
                document.getElementById('sendNotificationForm').reset();
                populateNotificationTargets([]);
                alert('Notification sent.');
                refreshNotificationsSilently();
            } catch (error) {
                alert('Failed to send notification: ' + error.message);
            }
        }

        function openNotificationModal(id) {
            const note = churchData.notifications.find(n => String(n.id) === String(id));
            if (!note) return;
            const titleEl = document.getElementById('notificationModalTitle');
            const bodyEl = document.getElementById('notificationModalBody');
            if (titleEl) titleEl.textContent = note.title || 'Notification';
            if (bodyEl) bodyEl.textContent = note.message || '';
            note.readAt = note.readAt || new Date().toISOString();
            saveNotificationsToStorage();
            updateNotificationsUI();
            apiRequest(`${API_ENDPOINTS.NOTIFICATIONS}/${id}/read`, { method: 'PUT' })
                .catch(error => console.warn('Failed to mark notification read:', error.message));
            showModal('notificationModal');
        }

        function toggleNotificationsDropdown() {
            const dropdown = document.getElementById('notificationsDropdown');
            if (!dropdown) return;
            dropdown.classList.toggle('open');
        }

        function closeNotificationsDropdown() {
            const dropdown = document.getElementById('notificationsDropdown');
            dropdown?.classList.remove('open');
        }

        function applyLogoUpdates() {
            updateLoginLogo();
            updateSidebarLogo();
            updateCurrentLogoPreview();
        }

        async function syncLogoFromServer() {
            try {
                const response = await fetch(API_ENDPOINTS.SETTINGS_LOGO);
                if (!response.ok) return;
                const data = await response.json();
                if (data?.logo) {
                    churchData.settings.logo = data.logo;
                    localStorage.setItem('logoImage', data.logo);
                    applyLogoUpdates();
                } else if (!churchData.settings.logo) {
                    churchData.settings.logo = DEFAULT_LOGO_URL;
                    applyLogoUpdates();
                }
            } catch (error) {
                console.warn('Failed to sync logo:', error.message);
            }
        }

        // Update login logo
        function updateLoginLogo() {
            const logoImage = churchData.settings.logo;
            const loginLogoPlaceholder = document.getElementById('loginLogoPlaceholder');
            const loginLogoImage = document.getElementById('loginLogoImage');
            
            if (logoImage) {
                loginLogoImage.src = logoImage;
                loginLogoImage.style.display = 'block';
                loginLogoPlaceholder.style.display = 'none';
            } else {
                loginLogoImage.style.display = 'none';
                loginLogoPlaceholder.style.display = 'flex';
            }
        }

        function updateSidebarLogo() {
            const logoImage = churchData.settings.logo;
            const sidebarLogoImage = document.getElementById('logoImage');
            const sidebarLogoPlaceholder = document.getElementById('logoIcon');

            if (logoImage) {
                sidebarLogoImage.src = logoImage;
                sidebarLogoImage.style.display = 'block';
                sidebarLogoPlaceholder.style.display = 'none';
            } else {
                sidebarLogoImage.style.display = 'none';
                sidebarLogoPlaceholder.style.display = 'flex';
            }
        }

        // Update current logo preview
        function updateCurrentLogoPreview() {
            const currentLogoPreview = document.getElementById('currentLogoPreview');
            const logoImage = churchData.settings.logo;
            
            if (logoImage) {
                currentLogoPreview.innerHTML = `<img src="${logoImage}" alt="Current Logo">`;
            } else {
                currentLogoPreview.innerHTML = `
                    <div class="logo-placeholder" style="font-size: 3rem;">
                        <i class="fas fa-church"></i>
                    </div>
                `;
            }
        }

        // Modal functions
        function showModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                
                if (modalId === 'addReportModal') {
                    const today = new Date().toISOString().split('T')[0];
                    document.getElementById('reportDate').value = today;
                    document.getElementById('reportTime').value = '19:00';
                    
                    const cellId = document.getElementById('reportCellId').value;
                    populateAttendees(cellId);
                }
            }
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
                const form = modal.querySelector('form');
                if (form) form.reset();
            }
        }

        // Close forgot password modal and show login
        function closeForgotPasswordModal() {
            closeModal('forgotPasswordModal');
            showLoginModal();
        }

        // Show login modal
        function showLoginModal() {
            closeModal('forgotPasswordModal');
            document.getElementById('loginModal').classList.add('active');
        }

        // Toggle dropdown
        function toggleDropdown(dropdownId) {
            const dropdown = document.getElementById(dropdownId);
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        }

        // Populate attendees for report
        

        

        

        

        

        // Show forgot password modal
        

        // Send reset code (server validated)
        

        // Move to next code input
        

        // Verify reset code (server validated)
        

        // Login function - MODIFIED for database-backed authentication
        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            try {
                const response = await fetch(API_ENDPOINTS.LOGIN, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    alert(data.error || 'Login failed');
                    return;
                }
                
                // Store token and user info
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('username', data.username);
                if (data.sessionId) {
                    localStorage.setItem('sessionId', data.sessionId);
                }
                localStorage.setItem('restrictedMenus', JSON.stringify(data.restrictedMenus || []));
                
                churchData.currentUser = {
                    username: data.username,
                    role: data.role,
                    token: data.token,
                    restrictedMenus: data.restrictedMenus || []
                };
                
                // Close login modal
                closeModal('loginModal');
                document.body.classList.remove('login-active');
                
                // Reset idle timer
                resetIdleTimer();
                sessionActiveMs = 0;
                sessionIdleMs = 0;
                sessionLastTick = Date.now();
                sessionIdle = false;
                if (sessionSyncTimer) {
                    clearInterval(sessionSyncTimer);
                }
                sessionSyncTimer = setInterval(syncSessionMetrics, 30000);
                if (!notificationsPollTimer) {
                    notificationsPollTimer = setInterval(refreshNotificationsSilently, 60000);
                }
                
                // Load data and update UI
                await loadAllData();
                applyUserPermissions();
                
                // Navigate based on role (restore last page if allowed)
                if (data.role === 'superuser' || data.role === 'admin') {
                    restoreActivePage('dashboard');
                } else {
                    restoreActivePage('members');
                }
                
                alert('Login successful!');
                
            } catch (error) {
                console.error('Login error:', error);
                alert('Login failed. Please check your credentials and try again.');
            }
        });

        function restoreActivePage(defaultPage) {
            const savedPage = localStorage.getItem('activePage');
            if (savedPage) {
                const restricted = new Set(churchData.currentUser?.restrictedMenus || []);
                const isMember = churchData.currentUser?.role === 'member';
                const allowedByRole = !isMember || savedPage === 'dashboard' || savedPage === 'members' || savedPage.startsWith('cell-');
                const targetExists = document.getElementById(savedPage);
                if (targetExists && !restricted.has(savedPage) && allowedByRole) {
                    navigateToPage(savedPage);
                    return;
                }
            }
            navigateToPage(defaultPage);
        }

        // Navigation function
        function navigateToPage(pageId) {
            document.querySelectorAll('.page-content').forEach(page => {
                page.classList.remove('active');
            });
            
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            
            const restricted = new Set(churchData.currentUser?.restrictedMenus || []);
            if (restricted.has(pageId)) {
                alert('You do not have access to this page.');
                return;
            }

            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                targetPage.classList.add('active');
                
                const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
                if (navItem) {
                    navItem.classList.add('active');
                }
                
                if (window.innerWidth <= 1024) {
                    sidebar.classList.remove('open');
                }

                localStorage.setItem('activePage', pageId);
            }
        }

        // Set theme
        function setTheme(theme) {
            churchData.settings.theme = theme;
            
            document.body.classList.remove('light-theme', 'dark-theme');
            
            if (theme === 'auto') {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.body.classList.add(prefersDark ? 'dark-theme' : 'light-theme');
            } else {
                document.body.classList.add(theme + '-theme');
            }
            
            document.querySelectorAll('.theme-option').forEach(option => {
                option.classList.remove('active');
                if (option.getAttribute('data-theme') === theme) {
                    option.classList.add('active');
                }
            });
            
            localStorage.setItem('theme', theme);
            churchData.settings.theme = theme;
        }

        // Apply theme from localStorage
        function applyThemeFromStorage() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            setTheme(savedTheme);
        }

        // Handle logo upload
        function handleLogoUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                const logoData = e.target.result;
                churchData.settings.logo = logoData;
                localStorage.setItem('logoImage', logoData);
                applyLogoUpdates();

                apiRequest(API_ENDPOINTS.SETTINGS_LOGO, {
                    method: 'POST',
                    body: JSON.stringify({ logo: logoData })
                }).catch(error => {
                    console.warn('Failed to save logo to server:', error.message);
                });

                alert('Logo uploaded successfully!');
            };
            reader.readAsDataURL(file);
        }

        // Save logo text
        function saveLogoText() {
            const title = document.getElementById('logoTitle').value;
            const subtitle = document.getElementById('logoSubtitle').value;
            
            churchData.settings.logoTitle = title;
            churchData.settings.logoSubtitle = subtitle;
            
            document.getElementById('logoTitleText').textContent = title;
            document.getElementById('logoSubtitleText').textContent = subtitle;
            document.getElementById('loginTitle').textContent = `Welcome to ${title}`;
            document.getElementById('loginSubtitle').textContent = subtitle;
            
            alert('Logo text saved successfully!');
        }

        async function runHealthCheck() {
            const statusEl = document.getElementById('healthCheckStatus');
            if (!statusEl) return;
            statusEl.textContent = 'Status: Checking...';
            try {
                const token = localStorage.getItem('token');
                const headers = token ? { Authorization: `Bearer ${token}` } : {};
                const resp = await fetch(API_ENDPOINTS.HEALTH, { headers });
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }
                const data = await resp.json();
                const ts = data?.ts ? ` at ${new Date(data.ts).toLocaleString()}` : '';
                statusEl.textContent = `Status: OK (${data?.db || 'connected'})${ts}`;
            } catch (err) {
                statusEl.textContent = `Status: Error (${err.message || 'Unknown error'})`;
            }
        }

        function updateHighlightLabel(toggleId, textId) {
            const toggle = document.getElementById(toggleId);
            const text = document.getElementById(textId);
            if (!toggle || !text) return;
            text.textContent = toggle.checked ? 'Yes' : 'No';
        }

        function setupPageManagementRealtime() {
            const navMenu = document.getElementById('navMenu');
            if (!navMenu || window.pageManagementObserver) return;

            let debounceTimer = null;
            const observer = new MutationObserver(() => {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                debounceTimer = setTimeout(() => {
                    if (typeof updatePageManagementTable === 'function') {
                        updatePageManagementTable();
                    }
                }, 50);
            });

            observer.observe(navMenu, { childList: true, subtree: true, attributes: true });
            window.pageManagementObserver = observer;
        }

        // Idle timeout functions
        function resetIdleTimer() {
            if (idleTimer) {
                clearTimeout(idleTimer);
            }
            if (idleModalTimer) {
                clearTimeout(idleModalTimer);
            }
            
            const now = Date.now();
            const delta = now - sessionLastTick;
            if (sessionIdle) {
                sessionIdleMs += delta;
            } else {
                sessionActiveMs += delta;
            }
            sessionLastTick = now;
            sessionIdle = false;
            lastActivityTime = now;
            
            if (churchData.currentUser) {
                idleTimer = setTimeout(showIdleModal, IDLE_TIMEOUT);
            }
        }

        function showIdleModal() {
            if (!churchData.currentUser) return;
            
            sessionIdle = true;
            idleCountdown = 30;
            document.getElementById('idleCountdown').textContent = idleCountdown;
            showModal('idleModal');
            
            idleModalTimer = setInterval(() => {
                idleCountdown--;
                document.getElementById('idleCountdown').textContent = idleCountdown;
                
                if (idleCountdown <= 0) {
                    clearInterval(idleModalTimer);
                    performLogout();
                }
            }, 1000);
        }

        function stayLoggedIn() {
            closeModal('idleModal');
            if (idleModalTimer) {
                clearInterval(idleModalTimer);
            }
            resetIdleTimer();
        }

        function syncSessionMetrics() {
            const sessionId = localStorage.getItem('sessionId');
            if (!sessionId) return;
            const now = Date.now();
            const delta = now - sessionLastTick;
            if (sessionIdle) {
                sessionIdleMs += delta;
            } else {
                sessionActiveMs += delta;
            }
            sessionLastTick = now;
            apiRequest(`${API_ENDPOINTS.SESSIONS}/${sessionId}/metrics`, {
                method: 'PUT',
                body: JSON.stringify({
                    idleMs: sessionIdleMs,
                    activeMs: sessionActiveMs
                })
            }).catch(error => {
                console.warn('Failed to sync session metrics:', error.message);
            });
        }

        // Setup event listeners
        function setupEventListeners() {
            // Mobile menu toggle
            mobileMenuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });

            // Close sidebar when clicking outside on mobile
            document.addEventListener('click', (e) => {
                if (window.innerWidth > 1024) return;
                if (!sidebar.classList.contains('open')) return;
                const clickedInsideSidebar = sidebar.contains(e.target);
                const clickedToggle = mobileMenuToggle.contains(e.target);
                if (!clickedInsideSidebar && !clickedToggle) {
                    sidebar.classList.remove('open');
                }
            });

            // Logo click
            document.getElementById('logoLink').addEventListener('click', () => {
                if (churchData.currentUser) {
                    if (churchData.currentUser.role === 'superuser' || churchData.currentUser.role === 'admin') {
                        navigateToPage('dashboard');
                    } else {
                        navigateToPage('members');
                    }
                }
            });

            // Navigation items
            document.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', function() {
                    const pageId = this.getAttribute('data-page');
                    navigateToPage(pageId);
                });
            });

            // Theme selection
            themeOptions.forEach(option => {
                option.addEventListener('click', function() {
                    const theme = this.getAttribute('data-theme');
                    setTheme(theme);
                });
            });

            // Logo upload
            document.getElementById('logoUpload').addEventListener('change', handleLogoUpload);

            // Save logo text
            document.getElementById('saveLogoTextBtn').addEventListener('click', saveLogoText);

            // Notifications bell
            const bellBtn = document.getElementById('notificationsBell');
            if (bellBtn) {
                bellBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleNotificationsDropdown();
                });
                bellBtn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleNotificationsDropdown();
                    }
                });
            }
            document.addEventListener('click', (e) => {
                const dropdown = document.getElementById('notificationsDropdown');
                if (!dropdown || !dropdown.classList.contains('open')) return;
                const bell = document.getElementById('notificationsBell');
                if (bell?.contains(e.target) || dropdown.contains(e.target)) return;
                closeNotificationsDropdown();
            });

            updateNotificationsTabs();
            document.getElementById('notificationTargetRoles')?.addEventListener('change', (e) => {
                const roles = Array.from(e.target.selectedOptions).map(option => option.value).filter(Boolean);
                populateNotificationTargets(roles);
            });
            document.getElementById('sendNotificationForm')?.addEventListener('submit', sendNotification);
            document.getElementById('clearNotificationsBtn')?.addEventListener('click', async () => {
                try {
                    await apiRequest(`${API_ENDPOINTS.NOTIFICATIONS}/read-all`, { method: 'PUT' });
                    churchData.notifications = churchData.notifications.map(n => ({
                        ...n,
                        readAt: n.readAt || new Date().toISOString()
                    }));
                    saveNotificationsToStorage();
                    updateNotificationsUI();
                    updateNotificationsTable();
                } catch (error) {
                    alert('Failed to clear notifications: ' + error.message);
                }
            });

            // Member highlight toggles
            document.getElementById('memberHighlightToggle')?.addEventListener('change', () => {
                updateHighlightLabel('memberHighlightToggle', 'memberHighlightText');
            });
            document.getElementById('editMemberHighlightToggle')?.addEventListener('change', () => {
                updateHighlightLabel('editMemberHighlightToggle', 'editMemberHighlightText');
            });
            updateHighlightLabel('memberHighlightToggle', 'memberHighlightText');
            updateHighlightLabel('editMemberHighlightToggle', 'editMemberHighlightText');

            setupPageManagementRealtime();

            // First-timers buttons and tabs
            document.getElementById('addFirstTimerBtn')?.addEventListener('click', () => {
                if (typeof openFirstTimerModal === 'function') {
                    openFirstTimerModal();
                }
            });

            document.getElementById('addFollowUpBtn')?.addEventListener('click', () => {
                if (typeof openFollowUpModal === 'function') {
                    openFollowUpModal();
                }
            });

            const ftTabs = document.getElementById('firstTimersTabs');
            if (ftTabs) {
                const buttons = ftTabs.querySelectorAll('.cell-tab-btn');
                const listTab = document.getElementById('firstTimersListTab');
                const followTab = document.getElementById('firstTimersFollowupsTab');
                buttons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        buttons.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const tab = btn.getAttribute('data-tab');
                        if (tab === 'followups') {
                            listTab?.classList.remove('active');
                            followTab?.classList.add('active');
                        } else {
                            followTab?.classList.remove('active');
                            listTab?.classList.add('active');
                        }
                    });
                });
            }

            // Health check
            document.getElementById('healthCheckBtn')?.addEventListener('click', runHealthCheck);

            // Modal close when clicking outside
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                if (modal.id !== 'loginModal') {
                    modal.addEventListener('click', function(e) {
                        if (e.target === this) {
                            closeModal(this.id);
                        }
                    });
                }
            });

            // Status toggle
            document.getElementById('userStatusToggle')?.addEventListener('change', function() {
                document.getElementById('userStatusText').textContent = this.checked ? 'Active' : 'Inactive';
            });
            
            document.getElementById('editUserStatusToggle')?.addEventListener('change', function() {
                document.getElementById('editUserStatusText').textContent = this.checked ? 'Active' : 'Inactive';
            });

            // Logout button
            document.getElementById('logoutBtn').addEventListener('click', () => {
                showModal('logoutConfirmModal');
            });

            // Stay logged in button
            document.getElementById('stayLoggedInBtn').addEventListener('click', stayLoggedIn);

            // Edit member form
            document.getElementById('editMemberForm').addEventListener('submit', function(e) {
                e.preventDefault();
                saveEditedMember();
            });

            // Edit cell form
            document.getElementById('editCellForm')?.addEventListener('submit', function(e) {
                e.preventDefault();
                saveEditedCell();
            });

            // Add new user button
            document.getElementById('addNewUserBtn')?.addEventListener('click', function() {
                populateRestrictedMenusOptions('restrictedMenusOptions');
                showModal('newUserModal');
            });

            // New user form
            document.getElementById('newUserForm')?.addEventListener('submit', async function(e) {
                e.preventDefault();

                const payload = {
                    username: document.getElementById('userUsername').value.trim(),
                    email: document.getElementById('userEmail').value.trim(),
                    password: document.getElementById('userPassword').value,
                    role: document.getElementById('userRole').value,
                    status: document.getElementById('userStatusToggle').checked,
                    restrictedMenus: getRestrictedMenusSelection('restrictedMenusOptions')
                };

                try {
                    const created = await apiRequest(API_ENDPOINTS.USERS, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });

                    churchData.users.push(created);
                    updateAccessManagementTable();
                    closeModal('newUserModal');
                    this.reset();
                    alert('User added successfully!');
                } catch (error) {
                    alert('Failed to add user: ' + error.message);
                }
            });

            // Edit user form
            document.getElementById('editUserForm')?.addEventListener('submit', function(e) {
                e.preventDefault();
                saveEditedUser();
            });

            document.getElementById('editPageIcon')?.addEventListener('input', function() {
                const preview = document.getElementById('editPageIconPreview');
                if (preview) {
                    preview.innerHTML = `<i class="${this.value}"></i>`;
                }
            });

            document.getElementById('editPageForm')?.addEventListener('submit', function(e) {
                e.preventDefault();
                const pageId = document.getElementById('editPageId').value;
                const label = document.getElementById('editPageName').value.trim();
                const icon = document.getElementById('editPageIcon').value.trim();

                if (!pageId || !label || !icon) {
                    alert('Menu name and icon are required.');
                    return;
                }

                const meta = getPageMeta();
                meta[pageId] = { label, icon };
                setPageMeta(meta);
                applyPageMetaToSidebar();
                updatePageManagementTable();
                closeModal('editPageModal');
            });

            // Confirm delete button
            document.getElementById('confirmDeleteBtn').addEventListener('click', function() {
                if (currentDeleteCallback) {
                    currentDeleteCallback();
                    currentDeleteCallback = null;
                }
            });

            // Add New Cell button
            document.getElementById('addNewCellBtn').addEventListener('click', function() {
                showModal('newCellModal');
            });

            // Perform logout
            window.performLogout = function() {
                const sessionId = localStorage.getItem('sessionId');
                if (sessionId) {
                    syncSessionMetrics();
                    apiRequest(`${API_ENDPOINTS.SESSIONS}/${sessionId}/end`, {
                        method: 'PUT'
                    }).catch(error => {
                        console.warn('Failed to end session:', error.message);
                    });
                }

                // Clear local storage
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                localStorage.removeItem('username');
                localStorage.removeItem('sessionId');
                localStorage.removeItem('restrictedMenus');
                
                // Reset current user
                churchData.currentUser = null;
                
                // Clear data
                churchData.cells = [];
                churchData.members = [];
                churchData.reports = [];
                churchData.users = [];
                churchData.sessions = [];
                
                // Close all modals
                document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                    modal.classList.remove('active');
                });
                
                // Show login modal
                document.body.classList.add('login-active');
                document.getElementById('loginModal').classList.add('active');
                
                // Reset login form
                document.getElementById('loginForm').reset();
                
                // Clear idle timers
                if (idleTimer) {
                    clearTimeout(idleTimer);
                    idleTimer = null;
                }
                if (idleModalTimer) {
                    clearInterval(idleModalTimer);
                    idleModalTimer = null;
                }

                if (sessionSyncTimer) {
                    clearInterval(sessionSyncTimer);
                    sessionSyncTimer = null;
                }
                if (notificationsPollTimer) {
                    clearInterval(notificationsPollTimer);
                    notificationsPollTimer = null;
                }
                
                // Reset UI
                updateAllUI();
            };

            // New Cell Form - MODIFIED for backend integration
            document.getElementById('newCellForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const payload = {
                    name: document.getElementById('cellName').value.trim(),
                    venue: document.getElementById('cellVenue').value.trim(),
                    day: document.getElementById('cellDay').value,
                    time: document.getElementById('cellTime').value,
                    description: document.getElementById('cellDescription').value.trim()
                };
                
                try {
                    const data = await apiRequest(API_ENDPOINTS.CELLS, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    
                    // Update local data
                    churchData.cells.push(data);
                    
                    // Create cell page
                    createCellPage(data);
                    
                    // Update UI
                    updateAllUI();
                    
                    closeModal('newCellModal');
                    this.reset();
                    
                    alert('Cell created successfully!');
                    refreshNotificationsSilently();
                } catch (error) {
                    alert('Failed to create cell: ' + error.message);
                }
            });

            // Add Report Form
            document.getElementById('addReportForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const cellId = document.getElementById('reportCellId').value;
                const date = document.getElementById('reportDate').value;
                const time = document.getElementById('reportTime').value;
                const venue = document.getElementById('reportVenue').value;
                const meetingType = document.getElementById('reportMeetingType').value;
                const description = document.getElementById('reportDescription').value;
                
                // Get selected attendees
                const present = [];
                const absent = [];
                const allMembers = churchData.members.filter(m => m.cellId === cellId);
                const selectedIds = new Set(
                    Array.from(document.querySelectorAll('#attendeesContainer input:checked')).map(cb => parseInt(cb.value))
                );
                allMembers.forEach(member => {
                    const entry = {
                        id: member.id,
                        title: member.title,
                        name: member.name,
                        role: member.role
                    };
                    if (selectedIds.has(member.id)) {
                        present.push(entry);
                    } else {
                        absent.push(entry);
                    }
                });
                
                const payload = {
                    cellId: cellId,
                    date: date + 'T' + time,
                    venue: venue,
                    meetingType: meetingType,
                    description: description,
                    attendees: { present, absent }
                };
                
                try {
                    const data = await apiRequest(API_ENDPOINTS.REPORTS, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    
                    // Update local data
                    churchData.reports.push(data);
                    
                    updateAllUI();
                    updateCellReports(cellId);
                    closeModal('addReportModal');
                    alert('Report added successfully!');
                    refreshNotificationsSilently();
                } catch (error) {
                    alert('Failed to add report: ' + error.message);
                }
            });

            document.getElementById('editReportForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const reportId = document.getElementById('editReportId').value;
                const cellId = document.getElementById('editReportCellId').value;
                const date = document.getElementById('editReportDate').value;
                const time = document.getElementById('editReportTime').value;
                const venue = document.getElementById('editReportVenue').value;
                const meetingType = document.getElementById('editReportMeetingType').value;
                const description = document.getElementById('editReportDescription').value;

                const present = [];
                const absent = [];
                const allMembers = churchData.members.filter(m => m.cellId === cellId);
                const selectedIds = new Set(
                    Array.from(document.querySelectorAll('#editAttendeesContainer input:checked')).map(cb => parseInt(cb.value))
                );
                allMembers.forEach(member => {
                    const entry = {
                        id: member.id,
                        title: member.title,
                        name: member.name,
                        role: member.role
                    };
                    if (selectedIds.has(member.id)) {
                        present.push(entry);
                    } else {
                        absent.push(entry);
                    }
                });

                const payload = {
                    date: date + 'T' + time,
                    venue: venue,
                    meetingType: meetingType,
                    description: description,
                    attendees: { present, absent }
                };

                try {
                    const updated = await apiRequest(`${API_ENDPOINTS.REPORTS}/${reportId}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload)
                    });

                    const index = churchData.reports.findIndex(r => String(r.id) === String(reportId));
                    if (index !== -1) {
                        churchData.reports[index] = updated;
                    }

                    updateAllUI();
                    updateCellReports(cellId);
                    closeModal('editReportModal');
                    alert('Report updated successfully!');
                    refreshNotificationsSilently();
                } catch (error) {
                    alert('Failed to update report: ' + error.message);
                }
            });

            // Add Member Form
            document.getElementById('addMemberForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const cellId = document.getElementById('memberCellId').value;
                const title = document.getElementById('memberTitle').value;
                const name = document.getElementById('memberName').value;
                const gender = document.getElementById('memberGender').value;
                const mobile = document.getElementById('memberMobile').value;
                const email = document.getElementById('memberEmail').value;
                const role = document.getElementById('memberRole').value;
                const highlightToggle = document.getElementById('memberHighlightToggle');
                const highlight = highlightToggle ? highlightToggle.checked : false;
                
                const payload = {
                    cellId: cellId,
                    title: title,
                    name: name,
                    gender: gender,
                    mobile: mobile,
                    email: email,
                    role: role,
                    isFirstTimer: highlight
                };
                
                try {
                    const data = await apiRequest(API_ENDPOINTS.MEMBERS, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    
                    // Update local data
                    churchData.members.push(data);

                    if (highlight && typeof ensureFirstTimerFromMember === 'function') {
                        await ensureFirstTimerFromMember(data);
                    }
                    
                    updateCellMembersTable(cellId);
                    updateAllMembersTable();
                    closeModal('addMemberModal');
                    alert('Member added successfully!');
                    refreshNotificationsSilently();
                } catch (error) {
                    alert('Failed to add member: ' + error.message);
                }
            });

            // Delegate events for dynamically created buttons
            document.addEventListener('click', function(e) {
                // Handle Add Report buttons on cell pages
                if (e.target.classList.contains('add-report-btn') || e.target.closest('.add-report-btn')) {
                    const btn = e.target.classList.contains('add-report-btn') ? e.target : e.target.closest('.add-report-btn');
                    const cellId = btn.getAttribute('data-cell-id').replace('cell-', '');
                    document.getElementById('reportCellId').value = cellId;
                    showModal('addReportModal');
                }
                
                // Handle Add Member buttons on cell pages
                if (e.target.classList.contains('add-member-btn') || e.target.closest('.add-member-btn')) {
                    const btn = e.target.classList.contains('add-member-btn') ? e.target : e.target.closest('.add-member-btn');
                    const cellId = btn.getAttribute('data-cell-id').replace('cell-', '');
                    document.getElementById('memberCellId').value = cellId;
                    showModal('addMemberModal');
                    const addHighlightToggle = document.getElementById('memberHighlightToggle');
                    if (addHighlightToggle) {
                        addHighlightToggle.checked = false;
                        updateHighlightLabel('memberHighlightToggle', 'memberHighlightText');
                    }
                }

                // Handle editable fields
                if (e.target.classList.contains('editable-field')) {
                    const field = e.target;
                    const cellId = field.getAttribute('data-cell-id').replace('cell-', '');
                    const fieldName = field.getAttribute('data-field');
                    
                    const currentValue = field.textContent;
                    const newValue = prompt(`Edit ${fieldName}:`, currentValue);
                    
                    if (newValue !== null && newValue !== currentValue) {
                        const cell = churchData.cells.find(c => c.id === cellId);
                        if (cell) {
                            cell[fieldName] = newValue;
                            field.textContent = newValue;
                            
                            // Update cell page title if name was changed
                            if (fieldName === 'name') {
                                const cellPageTitle = document.getElementById(`cellPageTitle-${cellId}`);
                                if (cellPageTitle) {
                                    cellPageTitle.textContent = newValue;
                                }
                            }
                            
                            updateAllUI();
                            
                            // Update in backend
                            apiRequest(`${API_ENDPOINTS.CELLS}/${cellId}`, {
                                method: 'PUT',
                                body: JSON.stringify({ [fieldName]: newValue })
                            }).then(() => {
                                refreshNotificationsSilently();
                            }).catch(error => {
                                console.error('Failed to update cell:', error);
                            });
                        }
                    }
                }
            });

            // Track user activity for idle timeout
            document.addEventListener('mousemove', resetIdleTimer);
            document.addEventListener('keydown', resetIdleTimer);
            document.addEventListener('click', resetIdleTimer);
            document.addEventListener('scroll', resetIdleTimer);
        }

        // Helper functions
        

        

        
        // Update sessions table
        


        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            initializeApplication();
            setupEventListeners();
            applyThemeFromStorage();
            updateCurrentLogoPreview();
            syncLogoFromServer();
            loadNotificationsFromStorage();
            updateNotificationsUI();
            if (!notificationsPollTimer) {
                notificationsPollTimer = setInterval(refreshNotificationsSilently, 60000);
            }
        });

        window.addEventListener('storage', (event) => {
            if (event.key === 'logoImage') {
                churchData.settings.logo = event.newValue || null;
                applyLogoUpdates();
            }
        });

        // Handle window resize for mobile
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) {
                sidebar.classList.remove('open');
            }
        });
