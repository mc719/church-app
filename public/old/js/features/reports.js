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
