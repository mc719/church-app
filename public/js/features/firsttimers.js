function getFirstTimerStatusLabel(status) {
    if (status === 'green') return 'Green';
    if (status === 'red') return 'Red';
    return 'Amber';
}

function yesNo(value) {
    if (value === true || String(value).toLowerCase() === 'yes' || String(value).toLowerCase() === 'true') return 'Yes';
    if (value === false || String(value).toLowerCase() === 'no' || String(value).toLowerCase() === 'false') return 'No';
    return '';
}

function formatList(value) {
    if (!value) return '';
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    return String(value);
}

function formatMonthDay(month, day) {
    if (!month || !day) return '';
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${dd}/${mm}`;
}

function csvToArray(text) {
    return String(text || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function updateFirstTimerSelects() {
    const cellSelect = document.getElementById('firstTimerCell');
    if (cellSelect) {
        const current = cellSelect.value;
        cellSelect.innerHTML = '<option value="">Select Cell</option>';
        churchData.cells.forEach(cell => {
            const opt = document.createElement('option');
            opt.value = cell.id;
            opt.textContent = cell.name;
            if (String(cell.id) === String(current)) opt.selected = true;
            cellSelect.appendChild(opt);
        });
    }

    const ftSelect = document.getElementById('followUpFirstTimer');
    if (ftSelect) {
        const current = ftSelect.value;
        ftSelect.innerHTML = '<option value="">Select First-Timer</option>';
        churchData.firstTimers.forEach(ft => {
            const opt = document.createElement('option');
            opt.value = ft.id;
            opt.textContent = [ft.name, ft.surname].filter(Boolean).join(' ').trim() || ft.name;
            if (String(ft.id) === String(current)) opt.selected = true;
            ftSelect.appendChild(opt);
        });
    }
}

function updateFirstTimersTable() {
    const tbody = document.getElementById('firstTimersBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!churchData.firstTimers.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 30px; color: var(--gray-color);">
                    No first-timers yet.
                </td>
            </tr>
        `;
        return;
    }

    churchData.firstTimers.forEach(ft => {
        const fullName = [ft.name, ft.surname].filter(Boolean).join(' ').trim();
        const dateJoined = ft.dateJoined ? new Date(ft.dateJoined).toLocaleDateString() : '';
        const birthday = formatMonthDay(ft.birthdayMonth, ft.birthdayDay);
        const lastFollow = churchData.followUps
            .filter(fu => String(fu.firstTimerId) === String(ft.id))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        const lastFollowText = lastFollow?.date ? new Date(lastFollow.date).toLocaleDateString() : '-';

        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.onclick = () => editFirstTimer(ft.id);
        row.innerHTML = `
            <td data-label="Name">${fullName || ft.name || ''}</td>
            <td data-label="Mobile">${formatPhoneLink(ft.mobile)}</td>
            <td data-label="Date Joined">${dateJoined}</td>
            <td data-label="Status">${getFirstTimerStatusLabel(ft.status)}</td>
            <td data-label="Actions">
                <div class="action-buttons">
                    <button class="action-btn edit-btn" onclick="event.stopPropagation(); editFirstTimer('${ft.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteFirstTimer('${ft.id}', '${fullName || ft.name}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    updateFirstTimerSelects();
}

function updateFollowUpsTable() {
    const tbody = document.getElementById('followUpsBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!churchData.followUps.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 30px; color: var(--gray-color);">
                    No follow-up records yet.
                </td>
            </tr>
        `;
        return;
    }

    churchData.followUps.forEach(fu => {
        const date = fu.date ? new Date(fu.date).toLocaleDateString() : '';
        const visitDate = fu.visitationDate ? new Date(fu.visitationDate).toLocaleDateString() : '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="First-Timer">${fu.firstTimerName || ''}</td>
            <td data-label="Date">${date}</td>
            <td data-label="Time">${fu.time || ''}</td>
            <td data-label="Comment">${fu.comment || ''}</td>
            <td data-label="Visitation Arranged">${fu.visitationArranged ? 'Yes' : 'No'}</td>
            <td data-label="Visitation Date">${visitDate}</td>
            <td data-label="Actions">
                <div class="action-buttons">
                    <button class="action-btn edit-btn" onclick="editFollowUp('${fu.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteFollowUp('${fu.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    updateFirstTimerSelects();
}

function openFirstTimerModal(ft = null) {
    document.getElementById('firstTimerModalTitle').textContent = ft ? 'Edit First-Timer' : 'Add First-Timer';
    document.getElementById('firstTimerId').value = ft?.id || '';
    document.getElementById('firstTimerName').value = ft?.name || '';
    document.getElementById('firstTimerSurname').value = ft?.surname || '';
    document.getElementById('firstTimerGender').value = ft?.gender || '';
    document.getElementById('firstTimerMobile').value = ft?.mobile || '';
    document.getElementById('firstTimerEmail').value = ft?.email || '';
    document.getElementById('firstTimerAddress').value = ft?.address || '';
    document.getElementById('firstTimerPostcode').value = ft?.postcode || '';
    document.getElementById('firstTimerBirthdayMonth').value = ft?.birthdayMonth || '';
    document.getElementById('firstTimerBirthdayDay').value = ft?.birthdayDay || '';
    document.getElementById('firstTimerAgeGroup').value = ft?.ageGroup || '';
    document.getElementById('firstTimerMaritalStatus').value = ft?.maritalStatus || '';
    document.getElementById('firstTimerBornAgain').value = yesNo(ft?.bornAgain) || '';
    document.getElementById('firstTimerSpeakTongues').value = yesNo(ft?.speakTongues) || '';
    document.getElementById('firstTimerFindOut').value = formatList(ft?.findOut);
    document.getElementById('firstTimerInvitedBy').value = ft?.invitedBy || '';
    document.getElementById('firstTimerContactPref').value = formatList(ft?.contactPref);
    document.getElementById('firstTimerVisit').value = yesNo(ft?.visit) || '';
    document.getElementById('firstTimerVisitWhen').value = ft?.visitWhen || '';
    document.getElementById('firstTimerPrayerRequests').value = Array.isArray(ft?.prayerRequests)
        ? ft.prayerRequests.join('\n')
        : (ft?.prayerRequests || '');
    document.getElementById('firstTimerDateJoined').value = ft?.dateJoined ? ft.dateJoined.split('T')[0] : '';
    document.getElementById('firstTimerStatus').value = ft?.status || 'amber';
    document.getElementById('firstTimerFoundation').value = ft?.foundationSchool || 'Not Yet';
    document.getElementById('firstTimerCell').value = ft?.cellId || '';
    updateFirstTimerSelects();
    showModal('firstTimerModal');
}

function editFirstTimer(id) {
    const ft = churchData.firstTimers.find(item => String(item.id) === String(id));
    if (ft) openFirstTimerModal(ft);
}

async function saveFirstTimer(e) {
    e.preventDefault();
    const id = document.getElementById('firstTimerId').value;
    const bMonth = document.getElementById('firstTimerBirthdayMonth').value;
    const bDay = document.getElementById('firstTimerBirthdayDay').value;
    const birthday = (bMonth && bDay) ? `${String(bMonth).padStart(2, '0')}-${String(bDay).padStart(2, '0')}` : '';
    const payload = {
        name: document.getElementById('firstTimerName').value.trim(),
        surname: document.getElementById('firstTimerSurname').value.trim(),
        gender: document.getElementById('firstTimerGender').value,
        mobile: document.getElementById('firstTimerMobile').value.trim(),
        email: document.getElementById('firstTimerEmail').value.trim(),
        address: document.getElementById('firstTimerAddress').value.trim(),
        postcode: document.getElementById('firstTimerPostcode').value.trim(),
        birthday,
        ageGroup: document.getElementById('firstTimerAgeGroup').value,
        maritalStatus: document.getElementById('firstTimerMaritalStatus').value,
        bornAgain: document.getElementById('firstTimerBornAgain').value,
        speakTongues: document.getElementById('firstTimerSpeakTongues').value,
        findOut: csvToArray(document.getElementById('firstTimerFindOut').value),
        invitedBy: document.getElementById('firstTimerInvitedBy').value.trim(),
        contactPref: csvToArray(document.getElementById('firstTimerContactPref').value),
        visit: document.getElementById('firstTimerVisit').value,
        visitWhen: document.getElementById('firstTimerVisitWhen').value.trim(),
        prayerRequests: document.getElementById('firstTimerPrayerRequests').value
            .split('\n')
            .map(v => v.trim())
            .filter(Boolean),
        dateJoined: document.getElementById('firstTimerDateJoined').value,
        status: document.getElementById('firstTimerStatus').value,
        foundationSchool: document.getElementById('firstTimerFoundation').value,
        cellId: document.getElementById('firstTimerCell').value
    };

    try {
        if (id) {
            const updated = await apiRequest(`${API_ENDPOINTS.FIRST_TIMERS}/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            const idx = churchData.firstTimers.findIndex(item => String(item.id) === String(id));
            if (idx !== -1) churchData.firstTimers[idx] = { ...churchData.firstTimers[idx], ...updated };
        } else {
            const created = await apiRequest(API_ENDPOINTS.FIRST_TIMERS, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            churchData.firstTimers.unshift(created);
        }
        updateFirstTimersTable();
        closeModal('firstTimerModal');
    } catch (error) {
        alert('Failed to save first-timer: ' + error.message);
    }
}

async function deleteFirstTimer(id, name) {
    if (!confirm(`Delete first-timer "${name}"?`)) return;
    try {
        await apiRequest(`${API_ENDPOINTS.FIRST_TIMERS}/${id}`, { method: 'DELETE' });
        churchData.firstTimers = churchData.firstTimers.filter(item => String(item.id) !== String(id));
        churchData.followUps = churchData.followUps.filter(item => String(item.firstTimerId) !== String(id));
        updateFirstTimersTable();
        updateFollowUpsTable();
    } catch (error) {
        alert('Failed to delete first-timer: ' + error.message);
    }
}

async function ensureFirstTimerFromMember(member) {
    if (!member || !member.name) return;
    const nameKey = String(member.name || '').trim().toLowerCase();
    const mobileKey = String(member.mobile || '').trim();
    const cellKey = String(member.cellId || '');

    const exists = churchData.firstTimers.some(ft => {
        const ftName = String(ft.name || '').trim().toLowerCase();
        const ftMobile = String(ft.mobile || '').trim();
        const ftCell = String(ft.cellId || '');
        return ftName === nameKey && ftMobile === mobileKey && ftCell === cellKey;
    });
    if (exists) return;

    const payload = {
        name: member.name,
        mobile: member.mobile || '',
        invitedBy: member.invitedBy || '',
        dateJoined: member.joinedDate ? String(member.joinedDate).split('T')[0] : '',
        status: 'amber',
        foundationSchool: 'Not Yet',
        cellId: member.cellId || ''
    };

    try {
        const created = await apiRequest(API_ENDPOINTS.FIRST_TIMERS, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const cell = churchData.cells.find(c => String(c.id) === String(created.cellId));
        churchData.firstTimers.unshift({
            ...created,
            cellName: created.cellName || cell?.name || ''
        });
        updateFirstTimersTable();
    } catch (error) {
        console.warn('Failed to auto-add first-timer:', error.message);
    }
}

function openFollowUpModal(fu = null) {
    document.getElementById('followUpModalTitle').textContent = fu ? 'Edit Follow-up Record' : 'Add Follow-up Record';
    document.getElementById('followUpId').value = fu?.id || '';
    document.getElementById('followUpFirstTimer').value = fu?.firstTimerId || '';
    document.getElementById('followUpDate').value = fu?.date || '';
    document.getElementById('followUpTime').value = fu?.time || '';
    document.getElementById('followUpComment').value = fu?.comment || '';
    document.getElementById('followUpVisitationArranged').checked = !!fu?.visitationArranged;
    document.getElementById('followUpVisitationDate').value = fu?.visitationDate || '';
    updateFirstTimerSelects();
    showModal('followUpModal');
}

function editFollowUp(id) {
    const fu = churchData.followUps.find(item => String(item.id) === String(id));
    if (fu) openFollowUpModal(fu);
}

async function saveFollowUp(e) {
    e.preventDefault();
    const id = document.getElementById('followUpId').value;
    const payload = {
        firstTimerId: document.getElementById('followUpFirstTimer').value,
        date: document.getElementById('followUpDate').value,
        time: document.getElementById('followUpTime').value,
        comment: document.getElementById('followUpComment').value.trim(),
        visitationArranged: document.getElementById('followUpVisitationArranged').checked,
        visitationDate: document.getElementById('followUpVisitationDate').value
    };

    try {
        if (id) {
            const updated = await apiRequest(`${API_ENDPOINTS.FOLLOW_UPS}/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            const idx = churchData.followUps.findIndex(item => String(item.id) === String(id));
            if (idx !== -1) churchData.followUps[idx] = { ...churchData.followUps[idx], ...updated };
        } else {
            const created = await apiRequest(API_ENDPOINTS.FOLLOW_UPS, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            churchData.followUps.unshift(created);
        }
        updateFollowUpsTable();
        closeModal('followUpModal');
    } catch (error) {
        alert('Failed to save follow-up: ' + error.message);
    }
}

async function deleteFollowUp(id) {
    if (!confirm('Delete this follow-up record?')) return;
    try {
        await apiRequest(`${API_ENDPOINTS.FOLLOW_UPS}/${id}`, { method: 'DELETE' });
        churchData.followUps = churchData.followUps.filter(item => String(item.id) !== String(id));
        updateFollowUpsTable();
    } catch (error) {
        alert('Failed to delete follow-up: ' + error.message);
    }
}

if (document.getElementById('firstTimerForm')) {
    document.getElementById('firstTimerForm').addEventListener('submit', saveFirstTimer);
}
if (document.getElementById('followUpForm')) {
    document.getElementById('followUpForm').addEventListener('submit', saveFollowUp);
}

(() => {
    const daySelect = document.getElementById('firstTimerBirthdayDay');
    const monthSelect = document.getElementById('firstTimerBirthdayMonth');
    if (daySelect && monthSelect) {
        for (let d = 1; d <= 31; d += 1) {
            const opt = document.createElement('option');
            opt.value = String(d);
            opt.textContent = String(d);
            daySelect.appendChild(opt);
        }
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        months.forEach((name, index) => {
            const opt = document.createElement('option');
            opt.value = String(index + 1);
            opt.textContent = name;
            monthSelect.appendChild(opt);
        });
    }
})();
