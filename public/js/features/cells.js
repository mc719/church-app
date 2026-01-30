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

function viewActiveCells() {
            alert('Active cells are those with reports in the last 30 days.');
        }

function viewInactiveCells() {
            alert('Inactive cells are those with no reports in the last 30 days.');
        }

function viewAllCells() {
            // Already viewing all cells in table
        }

function viewAllMembers() {
            navigateToPage('members');
        }

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
          if (typeof refreshNotificationsSilently === 'function') {
              refreshNotificationsSilently();
          }
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
                
                <div class="cell-tabs" id="cellTabs-${cell.id}">
                    <button class="cell-tab-btn active" data-tab="members">Members List</button>
                    <button class="cell-tab-btn" data-tab="reports">Reports | Cell Data</button>
                </div>
                
                <div class="cell-tab-content active" id="cellTabMembers-${cell.id}">
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
                </div>
                
                <div class="cell-tab-content" id="cellTabReports-${cell.id}">
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
                </div>
            `;
            
            dynamicCellPages.appendChild(cellPage);
            updateCellMembersTable(cell.id);
            updateCellReports(cell.id);
            populateYearFilter(cell.id);
            setupCellTabs(cell.id);
        }

function setupCellTabs(cellId) {
            const tabs = document.getElementById(`cellTabs-${cellId}`);
            const membersPane = document.getElementById(`cellTabMembers-${cellId}`);
            const reportsPane = document.getElementById(`cellTabReports-${cellId}`);
            if (!tabs || !membersPane || !reportsPane) return;

            const buttons = tabs.querySelectorAll('.cell-tab-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const tab = btn.getAttribute('data-tab');
                    if (tab === 'reports') {
                        membersPane.classList.remove('active');
                        reportsPane.classList.add('active');
                    } else {
                        reportsPane.classList.remove('active');
                        membersPane.classList.add('active');
                    }
                });
            });
        }

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
