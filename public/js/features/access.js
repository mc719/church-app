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
                    <td data-label="Username">${user.username}</td>
                    <td data-label="Email">${user.email || ''}</td>
                    <td data-label="Password">******</td>
                    <td data-label="Role">${user.role}</td>
                    <td data-label="Restricted Menus">${restrictedMenus || '-'}</td>
                    <td data-label="Status">${user.status ? 'Active' : 'Inactive'}</td>
                    <td data-label="Actions">
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
            let metaChanged = false;
            document.querySelectorAll('.nav-item').forEach(item => {
                const id = item.getAttribute('data-page');
                if (!id) return;

                const inCellGroup = !!item.closest('#cellGroupsContainer');
                const label = item.querySelector('span')?.textContent?.trim() || id;
                const icon = item.querySelector('i')?.className || (meta[id]?.icon || 'fas fa-file-alt');

                if (inCellGroup) {
                    pages.push({ id, label, icon, section: 'cell' });
                    return;
                }

                if (!meta[id]) {
                    meta[id] = { label, icon };
                    metaChanged = true;
                }
                pages.push({ id, label: meta[id].label, icon: meta[id].icon, section: 'system' });
            });
            if (metaChanged) {
                setPageMeta(meta);
            }
            tbody.innerHTML = '';

            const totalPages = getTotalPages(pages.length);
            paginationState.pageManagement = clampPage(paginationState.pageManagement, totalPages);
            const startIndex = (paginationState.pageManagement - 1) * PAGE_SIZE;
            const pageItems = pages.slice(startIndex, startIndex + PAGE_SIZE);

            pageItems.forEach(page => {
                const isActive = visibility[page.id] !== false;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td data-label="Menu Name">${page.label}</td>
                    <td data-label="Menu ID">${page.id}</td>
                    <td data-label="Icon"><i class="${page.icon}"></i></td>
                    <td data-label="Section">${page.section || 'system'}</td>
                    <td data-label="Active">
                        <label class="toggle-switch">
                            <input type="checkbox" ${isActive ? 'checked' : ''} data-page-id="${page.id}" class="page-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                    <td data-label="Actions">
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

function showForgotPassword() {
            closeModal('loginModal');
            document.getElementById('forgotStep1').style.display = 'block';
            document.getElementById('forgotStep2').style.display = 'none';
            showModal('forgotPasswordModal');
        }

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
