// API endpoints
        const API_BASE = '/api';
        const API_ENDPOINTS = {
            LOGIN: `${API_BASE}/login`,
            CELLS: `${API_BASE}/cells`,
            MEMBERS: `${API_BASE}/members`,
            REPORTS: `${API_BASE}/reports`,
            USERS: `${API_BASE}/users`,
            SESSIONS: `${API_BASE}/sessions`,
            HEALTH: `${API_BASE}/health`
        };

        // Data storage for frontend cache
        const churchData = {
            cells: [],
            reports: [],
            members: [],
            users: [],
            sessions: [],
            pageMeta: {},
            currentUser: null,
            settings: {
                theme: 'light',
                logo: null,
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
            updateAccessManagementTable();
            updatePageManagementTable();
            updateSessionsTable();
        }

        // Update statistics
        function updateStats() {
            const totalCells = churchData.cells.length;
            const totalMembers = churchData.members.length;
            
            // Calculate active cells (cells with reports in last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const activeCells = churchData.cells.filter(cell => {
                const cellReports = churchData.reports.filter(report => 
                    report.cellId === cell.id && new Date(report.date) > thirtyDaysAgo
                );
                return cellReports.length > 0;
            }).length;
            
            const inactiveCells = totalCells - activeCells;

            statsContainer.innerHTML = `
                <a href="javascript:void(0)" class="stat-link" onclick="viewAllCells()">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-church"></i>
                        </div>
                        <div class="stat-value" id="totalCells">${totalCells}</div>
                        <div class="stat-label">Total Cells</div>
                    </div>
                </a>
                <a href="javascript:void(0)" class="stat-link" onclick="viewAllMembers()">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-value" id="totalMembers">${totalMembers}</div>
                        <div class="stat-label">Total Members</div>
                    </div>
                </a>
                <a href="javascript:void(0)" class="stat-link" onclick="viewActiveCells()">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="stat-value" id="activeCells">${activeCells}</div>
                        <div class="stat-label">Active Cells</div>
                    </div>
                </a>
                <a href="javascript:void(0)" class="stat-link" onclick="viewInactiveCells()">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-times-circle"></i>
                        </div>
                        <div class="stat-value" id="inactiveCells">${inactiveCells}</div>
                        <div class="stat-label">Inactive Cells</div>
                    </div>
                </a>
            `;
        }

        // View active cells
        function viewActiveCells() {
            alert('Active cells are those with reports in the last 30 days.');
        }

        // View inactive cells
        function viewInactiveCells() {
            alert('Inactive cells are those with no reports in the last 30 days.');
        }

        // View all cells
        function viewAllCells() {
            // Already viewing all cells in table
        }

        // View all members
        function viewAllMembers() {
            navigateToPage('members');
        }

        
        // Update cells table
        function updateCellsTable() {
            cellsTableBody.innerHTML = '';
            
            if (churchData.cells.length === 0) {
                cellsTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px; color: var(--gray-color);">
                            No cells found. Click "Add New Cell" to create your first cell.
                        </td>
                    </tr>
                `;
                renderPagination('cellsPagination', 1, 1, () => {});
                return;
            }

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonthIndex = now.getMonth();
            const monthsElapsed = currentMonthIndex + 1;

            function getMonthlyReportCounts(cellId) {
                const counts = new Array(monthsElapsed).fill(0);
                churchData.reports.forEach(report => {
                    if (report.cellId !== cellId) return;
                    const dt = new Date(report.date);
                    if (dt.getFullYear() !== currentYear) return;
                    const m = dt.getMonth();
                    if (m >= 0 && m <= currentMonthIndex) {
                        counts[m] += 1;
                    }
                });
                return counts;
            }

            function getCellStatus(cellId) {
                const counts = getMonthlyReportCounts(cellId);
                const currentMonthCount = counts[currentMonthIndex] || 0;
                if (currentMonthCount <= 2) {
                    return { status: 'red', text: 'Below Target (0-2)' };
                }
                if (currentMonthCount <= 3) {
                    return { status: 'amber', text: 'At Risk (3)' };
                }
                return { status: 'green', text: 'On Track (4+)' };
            }

            function getGreenPercentage(cellId) {
                const counts = getMonthlyReportCounts(cellId);
                const greenMonths = counts.filter(count => count >= 4).length;
                const percentage = monthsElapsed ? Math.round((greenMonths / monthsElapsed) * 100) : 0;
                return { greenMonths, percentage };
            }

            const sortedCells = [...churchData.cells].sort((a, b) => {
                const aStats = getGreenPercentage(a.id);
                const bStats = getGreenPercentage(b.id);
                if (bStats.percentage !== aStats.percentage) {
                    return bStats.percentage - aStats.percentage;
                }
                return a.name.localeCompare(b.name);
            });

            const totalPages = getTotalPages(sortedCells.length);
            paginationState.cells = clampPage(paginationState.cells, totalPages);
            const startIndex = (paginationState.cells - 1) * PAGE_SIZE;
            const pageCells = sortedCells.slice(startIndex, startIndex + PAGE_SIZE);

            pageCells.forEach(cell => {
                // Count members in this cell
                const memberCount = churchData.members.filter(member => member.cellId === cell.id).length;
                
                const statusInfo = getCellStatus(cell.id);
                const statusClass = `status-${statusInfo.status}`;
                const percentStats = getGreenPercentage(cell.id);
                
                const row = document.createElement('tr');
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => {
                    showToast(`${cell.name}: ${percentStats.percentage}% green months in ${currentYear}`);
                });
                row.innerHTML = `
                    <td>${cell.name}</td>
                    <td>${cell.day} at ${cell.time}</td>
                    <td>${memberCount}</td>
                    <td><span class="${statusClass}">${statusInfo.text}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit-btn" onclick="event.stopPropagation(); editCell('${cell.id}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="action-btn delete-btn" onclick="event.stopPropagation(); confirmDeleteCell('${cell.id}', '${cell.name}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                `;
                cellsTableBody.appendChild(row);
            });

            renderPagination('cellsPagination', paginationState.cells, totalPages, (newPage) => {
                paginationState.cells = newPage;
                updateCellsTable();
            });
        }


  function editCell(cellId) {
      const cell = churchData.cells.find(c => c.id === cellId);
      if (!cell) return;

      document.getElementById('editCellId').value = cell.id;
      document.getElementById('editCellName').value = cell.name || '';
      document.getElementById('editCellVenue').value = cell.venue || '';
      document.getElementById('editCellDay').value = cell.day || '';
      document.getElementById('editCellTime').value = cell.time || '';
      document.getElementById('editCellDescription').value = cell.description || '';
      showModal('editCellModal');
  }

  async function saveEditedCell() {
      try {
          const cellId = document.getElementById('editCellId').value;
          const payload = {
              name: document.getElementById('editCellName').value.trim(),
              venue: document.getElementById('editCellVenue').value.trim(),
              day: document.getElementById('editCellDay').value,
              time: document.getElementById('editCellTime').value,
              description: document.getElementById('editCellDescription').value.trim()
          };

          const updated = await apiRequest(`${API_ENDPOINTS.CELLS}/${cellId}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
          });

          const index = churchData.cells.findIndex(c => c.id === cellId);
          if (index !== -1) {
              churchData.cells[index] = updated;
          }

          const titleEl = document.getElementById(`cellPageTitle-${cellId}`);
          if (titleEl) {
              titleEl.textContent = updated.name;
          }
          document.querySelectorAll(`.editable-field[data-cell-id="${cellId}"]`).forEach(el => {
              const field = el.getAttribute('data-field');
              if (field && updated[field] !== undefined) {
                  el.textContent = updated[field] || '';
              }
          });

          updateAllUI();
          closeModal('editCellModal');
          alert('Cell updated successfully!');
      } catch (error) {
          alert('Failed to update cell: ' + error.message);
      }
  }

  function confirmDeleteCell(cellId, cellName) {
      document.getElementById('deleteConfirmText').textContent =
          `Are you sure you want to delete cell "${cellName}"? This action cannot be undone.`;
      currentDeleteCallback = () => deleteCell(cellId);
      showModal('deleteConfirmModal');
  }

  async function deleteCell(cellId) {
      try {
          await apiRequest(`${API_ENDPOINTS.CELLS}/${cellId}`, {
              method: 'DELETE'
          });

          churchData.cells = churchData.cells.filter(c => c.id !== cellId);
          churchData.members = churchData.members.filter(m => m.cellId !== cellId);
          churchData.reports = churchData.reports.filter(r => r.cellId !== cellId);

          const navItem = document.querySelector(`.nav-item[data-page="cell-${cellId}"]`);
          if (navItem) {
              navItem.remove();
          }
          const page = document.getElementById(`cell-${cellId}`);
          if (page) {
              page.remove();
          }

          updateAllUI();
          closeModal('deleteConfirmModal');
          alert('Cell deleted successfully!');
      } catch (error) {
          alert('Failed to delete cell: ' + error.message);
      }
  }

  // Update recent reports
        function updateRecentReports() {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const recent = churchData.reports.filter(report => {
                return new Date(report.date) >= oneWeekAgo;
            });

            recent.sort((a, b) => new Date(b.date) - new Date(a.date));

            recentReports.innerHTML = '';
            
            if (recent.length === 0) {
                recentReports.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--gray-color);">
                        No recent reports from the past 7 days.
                    </div>
                `;
                return;
            }

            recent.forEach(report => {
                const cell = churchData.cells.find(c => c.id === report.cellId);
                const reportDate = new Date(report.date);
                const formattedDate = reportDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const formattedTime = reportDate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const { present, absent } = getReportAttendance(report);
                const reportCard = document.createElement('div');
                reportCard.className = 'report-card';
                reportCard.innerHTML = `
                    <div class="report-header">
                        <div>
                            <div class="report-date">${formattedDate} at ${formattedTime}</div>
                            <div class="report-venue">${report.venue}</div>
                            <div class="report-cell">${cell ? cell.name : 'Unknown Cell'}</div>
                        </div>
                        <div class="action-buttons">
                            <button class="action-btn delete-btn" onclick="deleteReport(${report.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="report-content">
                        <strong>Meeting Type:</strong> ${getMeetingTypeText(report.meetingType)}<br>
                        <strong>Present:</strong> ${present.length}<br>
                        <strong>Absent:</strong> ${absent.length}<br><br>
                        ${report.description || 'No additional information'}
                    </div>
                `;
                recentReports.appendChild(reportCard);
            });
        }

        // Helper function to get meeting type text
        function getMeetingTypeText(type) {
            const types = {
                'prayer': 'Prayer and Planning',
                'bible-study-1': 'Bible Study 1',
                'bible-study-2': 'Bible Study 2',
                'outreach': 'Outreach Meeting',
                'other': 'Other'
            };
            return types[type] || type;
        }

        // Update sidebar menus
        function updateSidebarMenus() {
            cellGroupsContainer.innerHTML = '';
            
            // Add cell groups
            churchData.cells.forEach(cell => {
                const navItem = document.createElement('div');
                navItem.className = 'nav-item';
                navItem.setAttribute('data-page', `cell-${cell.id}`);
                navItem.innerHTML = `
                    <i class="fas fa-users"></i>
                    <span>${cell.name}</span>
                `;
                
                navItem.onclick = function() {
                    navigateToPage(`cell-${cell.id}`);
                };
                
                cellGroupsContainer.appendChild(navItem);
            });

            applyPageMetaToSidebar();

            // Apply user permissions
            applyUserPermissions();
            applyPageVisibility();
        }

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
                    if (pageId !== 'dashboard' && pageId !== 'members' && !pageId.startsWith('cell-')) {
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
        }

        // Create cell page
        function createCellPage(cell) {
            const cellPage = document.createElement('div');
            cellPage.id = `cell-${cell.id}`;
            cellPage.className = 'page-content';
            
            cellPage.innerHTML = `
                <div class="page-header">
                    <h1 id="cellPageTitle-${cell.id}">${cell.name}</h1>
                    <div class="page-actions">
                        <button class="btn add-report-btn" data-cell-id="${cell.id}">
                            <i class="fas fa-plus"></i> Add Report
                        </button>
                        <button class="btn btn-success add-member-btn" data-cell-id="${cell.id}">
                            <i class="fas fa-user-plus"></i> Add Member
                        </button>
                    </div>
                </div>
                
                <div class="cell-header">
                    <div class="cell-info-item">
                        <div class="info-label">Cell Name</div>
                        <div class="info-value editable-field" data-field="name" data-cell-id="${cell.id}">${cell.name}</div>
                    </div>
                    <div class="cell-info-item">
                        <div class="info-label">Venue</div>
                        <div class="info-value editable-field" data-field="venue" data-cell-id="${cell.id}">${cell.venue}</div>
                    </div>
                    <div class="cell-info-item">
                        <div class="info-label">Day of Meeting</div>
                        <div class="info-value editable-field" data-field="day" data-cell-id="${cell.id}">${cell.day}</div>
                    </div>
                    <div class="cell-info-item">
                        <div class="info-label">Time</div>
                        <div class="info-value editable-field" data-field="time" data-cell-id="${cell.id}">${cell.time}</div>
                    </div>
                    <div class="cell-description">
                        <div class="info-label">Description</div>
                        <div class="info-value editable-field" data-field="description" data-cell-id="${cell.id}" style="min-height: 60px; padding: 10px;">
                            ${cell.description || 'No description'}
                        </div>
                    </div>
                </div>
                
                <div class="page-header">
                    <h2>Members List</h2>
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Name</th>
                                <th>Gender</th>
                                <th>Mobile</th>
                                <th>Cell Role</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="cellMembersBody-${cell.id}">
                            <!-- Members will be loaded dynamically -->
                        </tbody>
                    </table>
                </div>
                <div class="table-pagination" id="cellMembersPagination-${cell.id}"></div>
                
                <div class="page-header">
                    <h2>Reports | Cell Data</h2>
                </div>
                
                <div class="search-container">
                    <div class="search-box">
                        <input type="text" id="searchReports-${cell.id}" placeholder="Search reports..." oninput="searchReports('${cell.id}')">
                    </div>
                    <div class="search-box">
                        <select id="filterYear-${cell.id}" onchange="searchReports('${cell.id}')">
                            <option value="">All Years</option>
                        </select>
                    </div>
                    <div class="search-box">
                        <select id="filterMonth-${cell.id}" onchange="searchReports('${cell.id}')">
                            <option value="">All Months</option>
                            <option value="0">January</option>
                            <option value="1">February</option>
                            <option value="2">March</option>
                            <option value="3">April</option>
                            <option value="4">May</option>
                            <option value="5">June</option>
                            <option value="6">July</option>
                            <option value="7">August</option>
                            <option value="8">September</option>
                            <option value="9">October</option>
                            <option value="10">November</option>
                            <option value="11">December</option>
                        </select>
                    </div>
                    <div class="search-box">
                        <select id="filterMeetingType-${cell.id}" onchange="searchReports('${cell.id}')">
                            <option value="">All Meeting Types</option>
                            <option value="prayer">Prayer and Planning</option>
                            <option value="bible-study-1">Bible Study 1</option>
                            <option value="bible-study-2">Bible Study 2</option>
                            <option value="outreach">Outreach Meeting</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>
                
                <div id="monthlyReportsContainer-${cell.id}">
                    <!-- Monthly reports will be loaded dynamically -->
                </div>
            `;
            
            dynamicCellPages.appendChild(cellPage);
            updateCellMembersTable(cell.id);
            updateCellReports(cell.id);
            populateYearFilter(cell.id);
        }

        // Populate year filter
        function populateYearFilter(cellId) {
            const yearFilter = document.getElementById(`filterYear-${cellId}`);
            if (!yearFilter) return;
            
            const years = new Set();
            churchData.reports.forEach(report => {
                if (report.cellId === cellId) {
                    const year = new Date(report.date).getFullYear();
                    years.add(year);
                }
            });
            
            yearFilter.innerHTML = '<option value="">All Years</option>';
            
            Array.from(years).sort((a, b) => b - a).forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearFilter.appendChild(option);
            });
        }

        // Search reports
        function searchReports(cellId) {
            const searchTerm = document.getElementById(`searchReports-${cellId}`).value.toLowerCase();
            const selectedYear = document.getElementById(`filterYear-${cellId}`).value;
            const selectedMonth = document.getElementById(`filterMonth-${cellId}`).value;
            const selectedMeetingType = document.getElementById(`filterMeetingType-${cellId}`).value;
            
            const filteredReports = churchData.reports.filter(report => {
                if (report.cellId !== cellId) return false;
                
                if (searchTerm) {
                    const description = (report.description || '').toLowerCase();
                    const venue = (report.venue || '').toLowerCase();
                    const meetingType = getMeetingTypeText(report.meetingType).toLowerCase();
                    
                    if (!description.includes(searchTerm) && 
                        !venue.includes(searchTerm) && 
                        !meetingType.includes(searchTerm)) {
                        return false;
                    }
                }
                
                if (selectedYear) {
                    const reportYear = new Date(report.date).getFullYear();
                    if (reportYear.toString() !== selectedYear) return false;
                }
                
                if (selectedMonth !== '') {
                    const reportMonth = new Date(report.date).getMonth();
                    if (reportMonth.toString() !== selectedMonth) return false;
                }
                
                if (selectedMeetingType) {
                    if (report.meetingType !== selectedMeetingType) return false;
                }
                
                return true;
            });
            
            displayFilteredReports(cellId, filteredReports);
        }

        // Display filtered reports
        function displayFilteredReports(cellId, reports) {
            const container = document.getElementById(`monthlyReportsContainer-${cellId}`);
            if (!container) return;
            
            if (reports.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--gray-color);">
                        No reports found matching your search criteria.
                    </div>
                `;
                return;
            }
            
            const reportsByMonthYear = {};
            reports.forEach(report => {
                const date = new Date(report.date);
                const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                const yearMonthKey = `${date.getFullYear()}-${date.getMonth()}`;
                
                if (!reportsByMonthYear[yearMonthKey]) {
                    reportsByMonthYear[yearMonthKey] = {
                        display: monthYear,
                        reports: []
                    };
                }
                reportsByMonthYear[yearMonthKey].reports.push(report);
            });
            
            container.innerHTML = '';
            Object.keys(reportsByMonthYear).sort().reverse().forEach(key => {
                const monthData = reportsByMonthYear[key];
                const reportsList = monthData.reports;
                
                const monthSection = document.createElement('div');
                monthSection.className = 'monthly-reports accordion-section';
                monthSection.innerHTML = `
                    <div class="month-header">
                        <div class="month-title">${monthData.display}</div>
                        <div class="reports-count">${reportsList.length} Reports</div>
                    </div>
                    <div class="accordion-content">
                        <div class="reports-grid">
                        ${reportsList.map(report => {
                            const reportDate = new Date(report.date);
                            const formattedDate = reportDate.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            });
                            const formattedTime = reportDate.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            const canEdit = canEditReport(report);
                            
                            return `
                                <div class="report-card">
                                    <div class="report-header">
                                        <div>
                                            <div class="report-date">${formattedDate} at ${formattedTime}</div>
                                            <div class="report-venue">${report.venue}</div>
                                        </div>
                                        <div class="action-buttons">
                                            ${canEdit ? `
                                            <button class="action-btn edit-btn" onclick="editReport('${report.id}')">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            ` : ''}
                                            <button class="action-btn delete-btn" onclick="deleteReport(${report.id})">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="report-content">
                                        <strong>Meeting Type:</strong> ${getMeetingTypeText(report.meetingType)}<br>
                                        <strong>Present:</strong> ${getReportAttendance(report).present.length}<br>
                                        <strong>Absent:</strong> ${getReportAttendance(report).absent.length}<br>
                                        <strong>Present Members:</strong> ${getReportAttendance(report).present.length ? getReportAttendance(report).present.map(a => a.name).join(', ') : 'None'}<br>
                                        <strong>Absent Members:</strong> ${getReportAttendance(report).absent.length ? getReportAttendance(report).absent.map(a => a.name).join(', ') : 'None'}<br><br>
                                        ${report.description || 'No additional information'}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                        </div>
                    </div>
                `;
                
                container.appendChild(monthSection);
                const header = monthSection.querySelector('.month-header');
                if (header) {
                    header.addEventListener('click', () => {
                        monthSection.classList.toggle('open');
                    });
                }
            });
        }

        
        // Update cell members table
        function updateCellMembersTable(cellId) {
            const tbody = document.getElementById(`cellMembersBody-${cellId}`);
            if (!tbody) return;
            
            const members = churchData.members.filter(member => String(member.cellId) === String(cellId));
            const totalPages = getTotalPages(members.length);
            const currentPage = clampPage(paginationState.cellMembers[cellId] || 1, totalPages);
            paginationState.cellMembers[cellId] = currentPage;
            const startIndex = (currentPage - 1) * PAGE_SIZE;
            const pageMembers = members.slice(startIndex, startIndex + PAGE_SIZE);

            tbody.innerHTML = '';
            pageMembers.forEach(member => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${member.title}</td>
                    <td>${member.name}</td>
                    <td>${member.gender}</td>
                    <td>${member.mobile}</td>
                    <td>${member.role}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit-btn edit-member-btn" data-cell-id="${cellId}" data-member-id="${member.id}">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="action-btn delete-btn delete-member-btn" data-cell-id="${cellId}" data-member-id="${member.id}" data-member-name="${member.name}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                `;
                const editBtn = row.querySelector('.edit-member-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', () => {
                        editMember(cellId, member.id);
                    });
                }
                const deleteBtn = row.querySelector('.delete-member-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        confirmDeleteMember(cellId, member.id, member.name);
                    });
                }
                tbody.appendChild(row);
            });

            if (members.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray-color);">
                            No members found. Click "Add Member" to add members to this cell.
                        </td>
                    </tr>
                `;
            }
            
            updateAllMembersTable();

            renderPagination(`cellMembersPagination-${cellId}`, currentPage, totalPages, (newPage) => {
                paginationState.cellMembers[cellId] = newPage;
                updateCellMembersTable(cellId);
            });
        }


        
        // Update all members table (new function)
        function updateAllMembersTable() {
            const tbody = document.getElementById('allMembersBody');
            const grid = document.getElementById('membersGrid');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            if (grid) {
                grid.innerHTML = '';
            }

            const totalPages = getTotalPages(churchData.members.length);
            paginationState.members = clampPage(paginationState.members, totalPages);
            const startIndex = (paginationState.members - 1) * PAGE_SIZE;
            const pageMembers = churchData.members.slice(startIndex, startIndex + PAGE_SIZE);
            
            pageMembers.forEach(member => {
                const cell = churchData.cells.find(c => c.id === member.cellId);
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${member.title}</td>
                    <td>${member.name}</td>
                    <td>${member.gender}</td>
                    <td>${member.mobile}</td>
                    <td>${member.email || ''}</td>
                    <td>${cell ? cell.name : 'Unknown Cell'}</td>
                    <td>${member.role}</td>
                    <td>${cell ? cell.venue : ''}</td>
                    <td>${cell ? cell.day : ''}</td>
                    <td>${cell ? cell.time : ''}</td>
                    <td>${new Date(member.joinedDate).toLocaleDateString()}</td>
                `;
                tbody.appendChild(row);

                if (grid) {
                    const card = document.createElement('div');
                    card.className = 'member-card';
                    card.innerHTML = `
                        <div style="font-weight: 600;">${member.name}</div>
                        <div style="color: var(--gray-color); margin-top: 4px;">${member.role || ''}</div>
                        <div style="margin-top: 8px; font-size: 0.9rem;">
                            ${cell ? cell.name : 'Unknown Cell'}
                        </div>
                    `;
                    card.addEventListener('click', () => {
                        showMemberDetails(member, cell);
                    });
                    grid.appendChild(card);
                }
            });
            
            document.getElementById('membersCount').textContent = churchData.members.length;

            renderPagination('membersPagination', paginationState.members, totalPages, (newPage) => {
                paginationState.members = newPage;
                updateAllMembersTable();
            });
        }


        function showMemberDetails(member, cell) {
            const body = document.getElementById('memberDetailsBody');
            if (!body) return;
            body.innerHTML = `
                <div style="display: grid; gap: 10px;">
                    <div><strong>Name:</strong> ${member.name || ''}</div>
                    <div><strong>Title:</strong> ${member.title || ''}</div>
                    <div><strong>Gender:</strong> ${member.gender || ''}</div>
                    <div><strong>Mobile:</strong> ${member.mobile || ''}</div>
                    <div><strong>Email:</strong> ${member.email || ''}</div>
                    <div><strong>Role:</strong> ${member.role || ''}</div>
                    <div><strong>Cell:</strong> ${cell ? cell.name : 'Unknown Cell'}</div>
                    <div><strong>Venue:</strong> ${cell ? cell.venue : ''}</div>
                    <div><strong>Day/Time:</strong> ${cell ? `${cell.day} ${cell.time}` : ''}</div>
                </div>
            `;
            showModal('memberDetailsModal');
        }

        // Search members function
        function searchMembers() {
            const searchTerm = document.getElementById('searchMembers').value.toLowerCase();
            const rows = document.querySelectorAll('#allMembersBody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
            
            // Update count
            const visibleRows = Array.from(rows).filter(row => row.style.display !== 'none');
            document.getElementById('membersCount').textContent = visibleRows.length;
        }

        function getMenuOptions() {
            const options = [];
            document.querySelectorAll('.nav-item').forEach(item => {
                const id = item.getAttribute('data-page');
                const label = item.textContent.trim();
                if (id) {
                    options.push({ id, label });
                }
            });
            return options;
        }

        function getPageMeta() {
            if (Object.keys(churchData.pageMeta || {}).length) {
                return churchData.pageMeta;
            }
            try {
                const raw = localStorage.getItem('pageMeta');
                if (raw) {
                    churchData.pageMeta = JSON.parse(raw);
                    return churchData.pageMeta;
                }
            } catch {
                // ignore
            }
            const meta = {};
            document.querySelectorAll('.nav-item').forEach(item => {
                if (item.closest('#cellGroupsContainer')) return;
                const id = item.getAttribute('data-page');
                if (!id) return;
                const icon = item.querySelector('i')?.className || 'fas fa-file-alt';
                const label = item.querySelector('span')?.textContent?.trim() || id;
                meta[id] = { label, icon };
            });
            churchData.pageMeta = meta;
            localStorage.setItem('pageMeta', JSON.stringify(meta));
            return meta;
        }

        function setPageMeta(meta) {
            churchData.pageMeta = meta;
            localStorage.setItem('pageMeta', JSON.stringify(meta));
        }

        function applyPageMetaToSidebar() {
            const meta = getPageMeta();
            document.querySelectorAll('.nav-item').forEach(item => {
                if (item.closest('#cellGroupsContainer')) return;
                const id = item.getAttribute('data-page');
                if (!id || !meta[id]) return;
                item.innerHTML = `
                    <i class="${meta[id].icon}"></i>
                    <span>${meta[id].label}</span>
                `;
            });
        }

        function getPageVisibility() {
            try {
                const raw = localStorage.getItem('pageVisibility');
                return raw ? JSON.parse(raw) : {};
            } catch {
                return {};
            }
        }

        function setPageVisibility(pageId, isVisible) {
            const visibility = getPageVisibility();
            visibility[pageId] = isVisible;
            localStorage.setItem('pageVisibility', JSON.stringify(visibility));
        }

        function applyPageVisibility() {
            const visibility = getPageVisibility();
            document.querySelectorAll('.nav-item').forEach(item => {
                const pageId = item.getAttribute('data-page');
                if (!pageId) return;
                if (visibility[pageId] === false) {
                    item.style.display = 'none';
                } else {
                    item.style.display = 'flex';
                }
            });
        }

        function populateRestrictedMenusOptions(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';

            const menus = getMenuOptions();
            menus.forEach(menu => {
                const option = document.createElement('label');
                option.className = 'multiselect-option';
                option.innerHTML = `
                    <input type="checkbox" value="${menu.id}">
                    <span>${menu.label}</span>
                `;
                container.appendChild(option);
            });
        }

        function getRestrictedMenusSelection(containerId) {
            const selected = [];
            document.querySelectorAll(`#${containerId} input:checked`).forEach(input => {
                selected.push(input.value);
            });
            return selected;
        }

        function setRestrictedMenusSelection(containerId, values) {
            const valueSet = new Set(values || []);
            document.querySelectorAll(`#${containerId} input`).forEach(input => {
                input.checked = valueSet.has(input.value);
            });
        }

        
        function updateAccessManagementTable() {
            const tbody = document.getElementById('accessManagementBody');
            if (!tbody) return;

            tbody.innerHTML = '';

            const totalPages = getTotalPages(churchData.users.length);
            paginationState.access = clampPage(paginationState.access, totalPages);
            const startIndex = (paginationState.access - 1) * PAGE_SIZE;
            const pageUsers = churchData.users.slice(startIndex, startIndex + PAGE_SIZE);

            pageUsers.forEach(user => {
                const restrictedMenus = (user.restrictedMenus || []).join(', ');
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.username}</td>
                    <td>${user.email || ''}</td>
                    <td>******</td>
                    <td>${user.role}</td>
                    <td>${restrictedMenus || '-'}</td>
                    <td>${user.status ? 'Active' : 'Inactive'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit-btn" onclick="editUser('${user.id}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteUser('${user.id}', '${user.username}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });

            renderPagination('accessPagination', paginationState.access, totalPages, (newPage) => {
                paginationState.access = newPage;
                updateAccessManagementTable();
            });
        }


        
        function updatePageManagementTable() {
            const tbody = document.getElementById('pageManagementBody');
            if (!tbody) return;

            const visibility = getPageVisibility();
            const meta = getPageMeta();
            const pages = [];
            document.querySelectorAll('.nav-item').forEach(item => {
                if (item.closest('#cellGroupsContainer')) return;
                const id = item.getAttribute('data-page');
                if (!id || !meta[id]) return;
                pages.push({ id, label: meta[id].label, icon: meta[id].icon });
            });
            tbody.innerHTML = '';

            const totalPages = getTotalPages(pages.length);
            paginationState.pageManagement = clampPage(paginationState.pageManagement, totalPages);
            const startIndex = (paginationState.pageManagement - 1) * PAGE_SIZE;
            const pageItems = pages.slice(startIndex, startIndex + PAGE_SIZE);

            pageItems.forEach(page => {
                const isActive = visibility[page.id] !== false;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${page.label}</td>
                    <td>${page.id}</td>
                    <td><i class="${page.icon}"></i></td>
                    <td>system</td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" ${isActive ? 'checked' : ''} data-page-id="${page.id}" class="page-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit-btn" onclick="editPageMenu('${page.id}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="action-btn delete-btn" onclick="confirmDeletePageMenu('${page.id}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });

            renderPagination('pageManagementPagination', paginationState.pageManagement, totalPages, (newPage) => {
                paginationState.pageManagement = newPage;
                updatePageManagementTable();
            });

            document.querySelectorAll('.page-toggle').forEach(toggle => {
                toggle.addEventListener('change', function() {
                    const pageId = this.getAttribute('data-page-id');
                    setPageVisibility(pageId, this.checked);
                    applyPageVisibility();
                });
            });
        }


        function editPageMenu(pageId) {
            const meta = getPageMeta();
            if (!meta[pageId]) return;

            document.getElementById('editPageId').value = pageId;
            document.getElementById('editPageName').value = meta[pageId].label;
            document.getElementById('editPageIcon').value = meta[pageId].icon;
            document.getElementById('editPageIconPreview').innerHTML = `<i class="${meta[pageId].icon}"></i>`;
            showModal('editPageModal');
        }

        function confirmDeletePageMenu(pageId) {
            if (pageId === 'dashboard') {
                alert('Dashboard cannot be deleted.');
                return;
            }
            document.getElementById('deleteConfirmText').textContent =
                `Are you sure you want to delete menu "${pageId}"? This action cannot be undone.`;
            currentDeleteCallback = () => deletePageMenu(pageId);
            showModal('deleteConfirmModal');
        }

        function deletePageMenu(pageId) {
            const meta = getPageMeta();
            delete meta[pageId];
            setPageMeta(meta);
            setPageVisibility(pageId, false);

            const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
            if (navItem) {
                navItem.remove();
            }
            const page = document.getElementById(pageId);
            if (page) {
                page.remove();
            }

            updatePageManagementTable();
            applyPageVisibility();
            closeModal('deleteConfirmModal');
        }

        function editUser(userId) {
            const user = churchData.users.find(u => u.id === userId);
            if (!user) return;

            document.getElementById('editUserId').value = user.id;
            document.getElementById('editUserUsername').value = user.username;
            document.getElementById('editUserEmail').value = user.email || '';
            document.getElementById('editUserPassword').value = '';
            document.getElementById('editUserRole').value = user.role;
            document.getElementById('editUserStatusToggle').checked = !!user.status;
            document.getElementById('editUserStatusText').textContent = user.status ? 'Active' : 'Inactive';

            populateRestrictedMenusOptions('editRestrictedMenusOptions');
            setRestrictedMenusSelection('editRestrictedMenusOptions', user.restrictedMenus || []);

            showModal('editUserModal');
        }

        async function saveEditedUser() {
            try {
                const userId = document.getElementById('editUserId').value;
                const password = document.getElementById('editUserPassword').value;

                const payload = {
                    username: document.getElementById('editUserUsername').value.trim(),
                    email: document.getElementById('editUserEmail').value.trim(),
                    role: document.getElementById('editUserRole').value,
                    status: document.getElementById('editUserStatusToggle').checked,
                    restrictedMenus: getRestrictedMenusSelection('editRestrictedMenusOptions')
                };

                if (password) {
                    payload.password = password;
                }

                const updated = await apiRequest(`${API_ENDPOINTS.USERS}/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });

                const index = churchData.users.findIndex(u => u.id === userId);
                if (index !== -1) {
                    churchData.users[index] = updated;
                }

                updateAccessManagementTable();
                closeModal('editUserModal');
                alert('User updated successfully!');
            } catch (error) {
                alert('Failed to update user: ' + error.message);
            }
        }

        async function deleteUser(userId, username) {
            if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
                return;
            }

            try {
                await apiRequest(`${API_ENDPOINTS.USERS}/${userId}`, {
                    method: 'DELETE'
                });

                churchData.users = churchData.users.filter(u => u.id !== userId);
                updateAccessManagementTable();
            } catch (error) {
                alert('Failed to delete user: ' + error.message);
            }
        }

        // Edit member
        function editMember(cellId, memberId) {
            const member = churchData.members.find(m => m.id === memberId && String(m.cellId) === String(cellId));
            if (member) {
                document.getElementById('editMemberId').value = memberId;
                document.getElementById('editMemberCellId').value = cellId;
                document.getElementById('editMemberTitle').value = member.title;
                document.getElementById('editMemberName').value = member.name;
                document.getElementById('editMemberGender').value = member.gender;
                document.getElementById('editMemberMobile').value = member.mobile;
                document.getElementById('editMemberEmail').value = member.email || '';
                document.getElementById('editMemberRole').value = member.role;
                showModal('editMemberModal');
            }
        }

        // Save edited member
        async function saveEditedMember() {
            try {
                const memberId = parseInt(document.getElementById('editMemberId').value);
                const cellId = document.getElementById('editMemberCellId').value;
                
                const payload = {
                    title: document.getElementById('editMemberTitle').value,
                    name: document.getElementById('editMemberName').value,
                    gender: document.getElementById('editMemberGender').value,
                    mobile: document.getElementById('editMemberMobile').value,
                    email: document.getElementById('editMemberEmail').value,
                    role: document.getElementById('editMemberRole').value
                };
                
                await apiRequest(`${API_ENDPOINTS.MEMBERS}/${memberId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                
                // Update local data
                const memberIndex = churchData.members.findIndex(m => m.id === memberId && String(m.cellId) === String(cellId));
                if (memberIndex !== -1) {
                    churchData.members[memberIndex] = { ...churchData.members[memberIndex], ...payload };
                    updateCellMembersTable(cellId);
                    updateAllMembersTable();
                }
                
                closeModal('editMemberModal');
                alert('Member updated successfully!');
            } catch (error) {
                alert('Failed to update member: ' + error.message);
            }
        }

        // Confirm delete member
        function confirmDeleteMember(cellId, memberId, memberName) {
            document.getElementById('deleteConfirmText').textContent = 
                `Are you sure you want to delete member "${memberName}"? This action cannot be undone.`;
            
            currentDeleteCallback = () => deleteMember(cellId, memberId);
            showModal('deleteConfirmModal');
        }

        // Delete member
        async function deleteMember(cellId, memberId) {
            try {
                await apiRequest(`${API_ENDPOINTS.MEMBERS}/${memberId}`, {
                    method: 'DELETE'
                });
                
                // Update local data
                const memberIndex = churchData.members.findIndex(m => m.id === memberId && m.cellId === cellId);
                if (memberIndex !== -1) {
                    churchData.members.splice(memberIndex, 1);
                    updateCellMembersTable(cellId);
                    updateAllMembersTable();
                }
                
                closeModal('deleteConfirmModal');
                alert('Member deleted successfully!');
            } catch (error) {
                alert('Failed to delete member: ' + error.message);
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
        function populateAttendees(cellId) {
            const container = document.getElementById('attendeesContainer');
            if (!container) return;
            
            const members = churchData.members.filter(member => member.cellId === cellId);
            
            container.innerHTML = '';
            members.forEach(member => {
                const attendeeItem = document.createElement('div');
                attendeeItem.className = 'attendee-item';
                attendeeItem.innerHTML = `
                    <input type="checkbox" id="attendee-${member.id}" value="${member.id}" checked>
                    <label for="attendee-${member.id}">${member.title} ${member.name} (${member.role})</label>
                `;
                container.appendChild(attendeeItem);
            });
            
            if (members.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--gray-color);">No members in this cell yet.</p>';
            }
        }

        function getReportAttendance(report) {
            const attendees = report.attendees;
            if (Array.isArray(attendees)) {
                return { present: attendees, absent: [] };
            }
            if (attendees && typeof attendees === 'object') {
                return {
                    present: Array.isArray(attendees.present) ? attendees.present : [],
                    absent: Array.isArray(attendees.absent) ? attendees.absent : []
                };
            }
            return { present: [], absent: [] };
        }

        function canEditReport(report) {
            const role = churchData.currentUser?.role;
            if (role === 'superuser' || role === 'admin') {
                return true;
            }
            const reportDate = new Date(report.date);
            const now = new Date();
            const diffDays = Math.floor((now - reportDate) / (1000 * 60 * 60 * 24));
            return diffDays <= 14;
        }

        function populateEditAttendees(cellId, attendance) {
            const container = document.getElementById('editAttendeesContainer');
            if (!container) return;
            const members = churchData.members.filter(member => member.cellId === cellId);
            const presentIds = new Set(attendance.present.map(a => a.id));

            container.innerHTML = '';
            members.forEach(member => {
                const attendeeItem = document.createElement('div');
                attendeeItem.className = 'attendee-item';
                attendeeItem.innerHTML = `
                    <input type="checkbox" id="edit-attendee-${member.id}" value="${member.id}" ${presentIds.has(member.id) ? 'checked' : ''}>
                    <label for="edit-attendee-${member.id}">${member.title} ${member.name} (${member.role})</label>
                `;
                container.appendChild(attendeeItem);
            });

            if (members.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--gray-color);">No members in this cell yet.</p>';
            }
        }

        function editReport(reportId) {
            const report = churchData.reports.find(r => String(r.id) === String(reportId));
            if (!report || !canEditReport(report)) {
                alert('You are not allowed to edit this report.');
                return;
            }
            const date = new Date(report.date);
            const dateValue = date.toISOString().slice(0, 10);
            const timeValue = date.toISOString().slice(11, 16);
            const attendance = getReportAttendance(report);

            document.getElementById('editReportId').value = report.id;
            document.getElementById('editReportCellId').value = report.cellId;
            document.getElementById('editReportDate').value = dateValue;
            document.getElementById('editReportTime').value = timeValue;
            document.getElementById('editReportVenue').value = report.venue || '';
            document.getElementById('editReportMeetingType').value = report.meetingType || '';
            document.getElementById('editReportDescription').value = report.description || '';
            populateEditAttendees(report.cellId, attendance);

            showModal('editReportModal');
        }

        // Show forgot password modal
        function showForgotPassword() {
            closeModal('loginModal');
            document.getElementById('forgotStep1').style.display = 'block';
            document.getElementById('forgotStep2').style.display = 'none';
            showModal('forgotPasswordModal');
        }

        // Send reset code (server validated)
        async function sendResetCode() {
            const email = document.getElementById('forgotEmail').value.trim();
            if (!email) {
                alert('Please enter your email first.');
                return;
            }
            
            try {
                const response = await fetch('/api/otp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to send code');
                }
                
                if (data.devCode) {
                    alert(`One-time login code (dev): ${data.devCode}`);
                } else {
                    alert('One-time login code sent. Check your email.');
                }
                
                document.getElementById('forgotStep1').style.display = 'none';
                document.getElementById('forgotStep2').style.display = 'block';
                
                const codeInputs = document.querySelectorAll('.code-input');
                codeInputs.forEach(input => {
                    input.value = '';
                    input.classList.remove('filled');
                });
                
                codeInputs[0].focus();
            } catch (error) {
                alert('Failed to send code: ' + error.message);
            }
        }

        // Move to next code input
        function moveToNext(input, index) {
            const codeInputs = document.querySelectorAll('.code-input');
            
            if (input.value.length === 1 && index < 6) {
                codeInputs[index].focus();
            }
            
            if (input.value.length === 1) {
                input.classList.add('filled');
            } else {
                input.classList.remove('filled');
            }
        }

        // Verify reset code (server validated)
        async function verifyResetCode() {
            const codeInputs = document.querySelectorAll('.code-input');
            let enteredCode = '';
            codeInputs.forEach(input => {
                enteredCode += input.value;
            });
            
            const email = document.getElementById('forgotEmail').value.trim();
            if (!email) {
                alert('Please enter your email first.');
                return;
            }
            
            try {
                const response = await fetch('/api/otp/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, code: enteredCode })
                });
                
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Invalid code');
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
                
                closeModal('forgotPasswordModal');
                document.body.classList.remove('login-active');
                resetIdleTimer();
                sessionActiveMs = 0;
                sessionIdleMs = 0;
                sessionLastTick = Date.now();
                sessionIdle = false;
                if (sessionSyncTimer) {
                    clearInterval(sessionSyncTimer);
                }
                sessionSyncTimer = setInterval(syncSessionMetrics, 30000);
                await loadAllData();
                applyUserPermissions();
                
                if (data.role === 'superuser' || data.role === 'admin') {
                    navigateToPage('dashboard');
                } else {
                    navigateToPage('members');
                }
            } catch (error) {
                alert(error.message || 'Invalid code. Please try again.');
                codeInputs.forEach(input => {
                    input.value = '';
                    input.classList.remove('filled');
                });
                codeInputs[0].focus();
            }
        }

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
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    churchData.settings.logo = e.target.result;
                    localStorage.setItem('logoImage', e.target.result);
                    updateLoginLogo();
                    updateSidebarLogo();
                    updateCurrentLogoPreview();
                    
                    alert('Logo uploaded successfully!');
                };
                reader.readAsDataURL(file);
            }
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
                
                const payload = {
                    cellId: cellId,
                    title: title,
                    name: name,
                    gender: gender,
                    mobile: mobile,
                    email: email,
                    role: role
                };
                
                try {
                    const data = await apiRequest(API_ENDPOINTS.MEMBERS, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    
                    // Update local data
                    churchData.members.push(data);
                    
                    updateCellMembersTable(cellId);
                    updateAllMembersTable();
                    closeModal('addMemberModal');
                    alert('Member added successfully!');
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
        async function deleteReport(id) {
            if (confirm('Are you sure you want to delete this report?')) {
                try {
                    await apiRequest(`${API_ENDPOINTS.REPORTS}/${id}`, {
                        method: 'DELETE'
                    });
                    
                    // Update local data
                    churchData.reports = churchData.reports.filter(report => report.id !== id);
                    
                    updateRecentReports();
                    
                    // Update all cell reports
                    churchData.cells.forEach(cell => {
                        updateCellReports(cell.id);
                    });
                    
                    alert('Report deleted successfully!');
                } catch (error) {
                    alert('Failed to delete report: ' + error.message);
                }
            }
        }

        function updateCellReports(cellId) {
            searchReports(cellId);
        }

        
        // Update sessions table
        function updateSessionsTable() {
            const tbody = document.getElementById('sessionsBody');
            tbody.innerHTML = '';
            if (!churchData.sessions.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="11" style="text-align: center; padding: 40px; color: var(--gray-color);">
                            No sessions recorded yet.
                        </td>
                    </tr>
                `;
                renderPagination('sessionsPagination', 1, 1, () => {});
                return;
            }

            function parseUserAgent(ua) {
                const agent = ua || '';
                let browser = 'Unknown';
                let os = 'Unknown';

                if (agent.includes('Edg/')) browser = 'Edge';
                else if (agent.includes('Chrome/')) browser = 'Chrome';
                else if (agent.includes('Firefox/')) browser = 'Firefox';
                else if (agent.includes('Safari/') && !agent.includes('Chrome/')) browser = 'Safari';

                if (agent.includes('Windows')) os = 'Windows';
                else if (agent.includes('Mac OS X')) os = 'macOS';
                else if (agent.includes('Android')) os = 'Android';
                else if (agent.includes('iPhone') || agent.includes('iPad')) os = 'iOS';
                else if (agent.includes('Linux')) os = 'Linux';

                return { browser, os };
            }

            const totalPages = getTotalPages(churchData.sessions.length);
            paginationState.sessions = clampPage(paginationState.sessions, totalPages);
            const startIndex = (paginationState.sessions - 1) * PAGE_SIZE;
            const pageSessions = churchData.sessions.slice(startIndex, startIndex + PAGE_SIZE);

            pageSessions.forEach(session => {
                const loginTime = session.loginTime ? new Date(session.loginTime) : null;
                const logoutTime = session.logoutTime ? new Date(session.logoutTime) : null;
                const activeMs = typeof session.activeMs === 'number' ? session.activeMs : 0;
                const idleMs = typeof session.idleMs === 'number' ? session.idleMs : 0;
                const totalMs = activeMs + idleMs;
                const activeTime = totalMs ? Math.round(activeMs / 60000) + ' min' : '-';
                const idleTime = totalMs ? Math.round(idleMs / 60000) + ' min' : '-';
                const totalTime = totalMs ? Math.round(totalMs / 60000) + ' min' : '-';
                const status = logoutTime ? 'Ended' : 'Active';
                const ua = parseUserAgent(session.userAgent || '');
                const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${session.username || ''}</td>
                    <td>${loginTime ? loginTime.toLocaleString() : ''}</td>
                    <td>${logoutTime ? logoutTime.toLocaleString() : ''}</td>
                    <td>${session.ipAddress || ''}</td>
                    <td>${ua.browser}</td>
                    <td>${ua.os}</td>
                    <td>${timezone}</td>
                    <td>${activeTime}</td>
                    <td>${idleTime}</td>
                    <td>${totalTime}</td>
                    <td>${status}</td>
                `;
                tbody.appendChild(row);
            });

            renderPagination('sessionsPagination', paginationState.sessions, totalPages, (newPage) => {
                paginationState.sessions = newPage;
                updateSessionsTable();
            });
        }


        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            initializeApplication();
            setupEventListeners();
            applyThemeFromStorage();
            updateCurrentLogoPreview();
        });

        // Handle window resize for mobile
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) {
                sidebar.classList.remove('open');
            }
        });
