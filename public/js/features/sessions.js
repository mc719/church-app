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
                    <td data-label="User">${session.username || ''}</td>
                    <td data-label="Start Time">${loginTime ? loginTime.toLocaleString() : ''}</td>
                    <td data-label="Logout Time">${logoutTime ? logoutTime.toLocaleString() : ''}</td>
                    <td data-label="IP Address">${session.ipAddress || ''}</td>
                    <td data-label="Browser">${ua.browser}</td>
                    <td data-label="OS">${ua.os}</td>
                    <td data-label="Timezone">${timezone}</td>
                    <td data-label="Active Time">${activeTime}</td>
                    <td data-label="Idle Time">${idleTime}</td>
                    <td data-label="Total Time">${totalTime}</td>
                    <td data-label="Status">${status}</td>
                `;
                tbody.appendChild(row);
            });

            renderPagination('sessionsPagination', paginationState.sessions, totalPages, (newPage) => {
                paginationState.sessions = newPage;
                updateSessionsTable();
            });
        }
