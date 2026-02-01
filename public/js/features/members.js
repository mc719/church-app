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
                if (member.isFirstTimer) {
                    row.classList.add('member-highlight');
                }
                row.innerHTML = `
                    <td>${member.title}</td>
                    <td>${member.name}</td>
                    <td>${member.gender}</td>
                    <td>${formatPhoneLink(member.mobile)}</td>
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

let membersSearchTerm = '';

function getFilteredMembers() {
            if (!membersSearchTerm) {
                return churchData.members;
            }
            const term = membersSearchTerm.toLowerCase();
            return churchData.members.filter(member => {
                const cell = churchData.cells.find(c => c.id === member.cellId);
                const dob = member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleDateString() : '';
                const parts = [
                    member.title,
                    member.name,
                    member.gender,
                    member.mobile,
                    member.email,
                    member.role,
                    dob,
                    cell?.name,
                    cell?.venue,
                    cell?.day,
                    cell?.time
                ].filter(Boolean).join(' ').toLowerCase();
                return parts.includes(term);
            });
        }

function updateAllMembersTable() {
            const tbody = document.getElementById('allMembersBody');
            const grid = document.getElementById('membersGrid');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            if (grid) {
                grid.innerHTML = '';
            }

            const filteredMembers = getFilteredMembers();
            const totalPages = getTotalPages(filteredMembers.length);
            paginationState.members = clampPage(paginationState.members, totalPages);
            const startIndex = (paginationState.members - 1) * PAGE_SIZE;
            const pageMembers = filteredMembers.slice(startIndex, startIndex + PAGE_SIZE);
            
            pageMembers.forEach(member => {
                const cell = churchData.cells.find(c => c.id === member.cellId);
                
                const row = document.createElement('tr');
                if (member.isFirstTimer) {
                    row.classList.add('member-highlight');
                }
                row.innerHTML = `
                    <td>${member.title}</td>
                    <td>${member.name}</td>
                    <td>${member.gender}</td>
                    <td>${formatPhoneLink(member.mobile)}</td>
                    <td>${formatEmailLink(member.email)}</td>
                    <td>${cell ? cell.name : 'Unknown Cell'}</td>
                    <td>${member.role}</td>
                    <td>${cell ? cell.venue : ''}</td>
                    <td>${cell ? cell.day : ''}</td>
                    <td>${cell ? cell.time : ''}</td>
                    <td>${new Date(member.joinedDate).toLocaleDateString()}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit-btn edit-member-btn" data-member-id="${member.id}">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="action-btn delete-btn delete-member-btn" data-member-id="${member.id}" data-member-name="${member.name}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                `;
                const editBtn = row.querySelector('.edit-member-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', () => {
                        editMember(member.cellId, member.id);
                    });
                }
                const deleteBtn = row.querySelector('.delete-member-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        confirmDeleteMember(member.cellId, member.id, member.name);
                    });
                }
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
            
            document.getElementById('membersCount').textContent = filteredMembers.length;

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
                    <div><strong>Mobile:</strong> ${formatPhoneLink(member.mobile)}</div>
                    <div><strong>Email:</strong> ${formatEmailLink(member.email)}</div>
                    <div><strong>Date of Birth:</strong> ${member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleDateString() : ''}</div>
                    <div><strong>Role:</strong> ${member.role || ''}</div>
                    <div><strong>Cell:</strong> ${cell ? cell.name : 'Unknown Cell'}</div>
                    <div><strong>Venue:</strong> ${cell ? cell.venue : ''}</div>
                    <div><strong>Day/Time:</strong> ${cell ? `${cell.day} ${cell.time}` : ''}</div>
                </div>
            `;
            showModal('memberDetailsModal');
        }

function searchMembers() {
            membersSearchTerm = document.getElementById('searchMembers').value.trim();
            paginationState.members = 1;
            updateAllMembersTable();
        }

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
                document.getElementById('editMemberDob').value = member.dateOfBirth ? String(member.dateOfBirth).split('T')[0] : '';
                document.getElementById('editMemberRole').value = member.role;
                const highlightToggle = document.getElementById('editMemberHighlightToggle');
                if (highlightToggle) {
                    highlightToggle.checked = !!member.isFirstTimer;
                    if (typeof updateHighlightLabel === 'function') {
                        updateHighlightLabel('editMemberHighlightToggle', 'editMemberHighlightText');
                    }
                }
                showModal('editMemberModal');
            }
        }

async function saveEditedMember() {
            try {
                const memberId = parseInt(document.getElementById('editMemberId').value);
                const cellId = document.getElementById('editMemberCellId').value;
                
                const highlightToggle = document.getElementById('editMemberHighlightToggle');
                const highlight = highlightToggle ? highlightToggle.checked : false;

                const payload = {
                    title: document.getElementById('editMemberTitle').value,
                    name: document.getElementById('editMemberName').value,
                    gender: document.getElementById('editMemberGender').value,
                    mobile: document.getElementById('editMemberMobile').value,
                    email: document.getElementById('editMemberEmail').value,
                    dateOfBirth: document.getElementById('editMemberDob').value,
                    role: document.getElementById('editMemberRole').value,
                    isFirstTimer: highlight
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

                if (highlight && typeof ensureFirstTimerFromMember === 'function') {
                    const memberData = memberIndex !== -1
                        ? { ...churchData.members[memberIndex], cellId: cellId }
                        : { ...payload, cellId: cellId };
                    await ensureFirstTimerFromMember(memberData);
                }
                
                closeModal('editMemberModal');
                alert('Member updated successfully!');
                if (typeof refreshNotificationsSilently === 'function') {
                    refreshNotificationsSilently();
                }
                if (typeof refreshBirthdays === 'function') {
                    refreshBirthdays();
                }
            } catch (error) {
                alert('Failed to update member: ' + error.message);
            }
        }

function confirmDeleteMember(cellId, memberId, memberName) {
            document.getElementById('deleteConfirmText').textContent = 
                `Are you sure you want to delete member "${memberName}"? This action cannot be undone.`;
            
            currentDeleteCallback = () => deleteMember(cellId, memberId);
            showModal('deleteConfirmModal');
        }

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
