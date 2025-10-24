const API_URL = 'http://localhost:3000/api';
let currentPage = 1;
let currentLimit = 100;
let totalMessages = 0;
let allMessages = [];

// DOM elements
const messagesContainer = document.getElementById('messagesContainer');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const messageCount = document.getElementById('messageCount');
const searchInput = document.getElementById('searchInput');
const limitSelect = document.getElementById('limitSelect');
const refreshBtn = document.getElementById('refreshBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const schemaInfo = document.getElementById('schemaInfo');
const schemaContent = document.getElementById('schemaContent');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchMessages();
    fetchMessageCount();
    fetchSchema();
    
    // Event listeners
    refreshBtn.addEventListener('click', () => {
        currentPage = 1;
        fetchMessages();
        fetchMessageCount();
    });
    
    searchInput.addEventListener('input', filterMessages);
    
    limitSelect.addEventListener('change', (e) => {
        currentLimit = parseInt(e.target.value);
        currentPage = 1;
        fetchMessages();
    });
    
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchMessages();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        currentPage++;
        fetchMessages();
    });
});

// Fetch messages from API
async function fetchMessages() {
    try {
        showLoading();
        hideError();
        
        const offset = (currentPage - 1) * currentLimit;
        const response = await fetch(`${API_URL}/messages?limit=${currentLimit}&offset=${offset}`);
        const data = await response.json();
        
        if (data.success) {
            allMessages = data.messages;
            displayMessages(allMessages);
            updatePagination();
        } else {
            showError('Failed to load messages: ' + data.error);
        }
    } catch (error) {
        showError('Error connecting to server: ' + error.message);
    } finally {
        hideLoading();
    }
}


async function fetchMessageCount() {
    try {
        const response = await fetch(`${API_URL}/messages/count`);
        const data = await response.json();
        
        if (data.success) {
            totalMessages = data.count;
            messageCount.textContent = `${totalMessages} messages`;
        }
    } catch (error) {
        console.error('Error fetching message count:', error);
        messageCount.textContent = 'Unknown';
    }
}

async function fetchSchema() {
    try {
        const response = await fetch(`${API_URL}/schema`);
        const data = await response.json();
        
        if (data.success && data.columns.length > 0) {
            const schemaHtml = '<table style="width: 100%; border-collapse: collapse;">' +
                '<tr style="background: #f0f0f0;"><th style="padding: 8px; text-align: left;">Column</th>' +
                '<th style="padding: 8px; text-align: left;">Type</th>' +
                '<th style="padding: 8px; text-align: left;">Nullable</th></tr>' +
                data.columns.map(col => 
                    `<tr><td style="padding: 8px;">${col.column_name}</td>` +
                    `<td style="padding: 8px;">${col.data_type}</td>` +
                    `<td style="padding: 8px;">${col.is_nullable}</td></tr>`
                ).join('') +
                '</table>';
            schemaContent.innerHTML = schemaHtml;
            schemaInfo.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching schema:', error);
    }
}


function displayMessages(messages) {
    if (!messages || messages.length === 0) {
        messagesContainer.innerHTML = '<div class="no-messages">No messages found</div>';
        return;
    }
    
    const html = messages.map(msg => createMessageCard(msg)).join('');
    messagesContainer.innerHTML = html;
}

function createMessageCard(message) {
    
    const fields = Object.keys(message);
    // Reminder to neaten this up later //
    const userField = fields.find(f => f.toLowerCase().includes('user') || f.toLowerCase().includes('author') || f.toLowerCase().includes('sender')) || fields[0];
    const contentField = fields.find(f => f.toLowerCase().includes('content') || f.toLowerCase().includes('message') || f.toLowerCase().includes('text')) || fields[1];
    const timeField = fields.find(f => f.toLowerCase().includes('time') || f.toLowerCase().includes('date') || f.toLowerCase().includes('created'));
    
    const user = message[userField] || 'Unknown User';
    const content = message[contentField] || 'No content';
    const timestamp = message[timeField] ? formatDate(message[timeField]) : '';
    

    const metadataFields = fields.filter(f => f !== userField && f !== contentField && f !== timeField);
    const metadata = metadataFields.map(field => {
        const value = message[field];
        if (value !== null && value !== undefined) {
            return `<span class="metadata-item"><span class="metadata-label">${field}:</span> ${formatValue(value)}</span>`;
        }
        return '';
    }).filter(Boolean).join('');
    
    return `
        <div class="message-card">
            <div class="message-header">
                <span class="message-user">${escapeHtml(String(user))}</span>
                ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
            </div>
            <div class="message-content">${escapeHtml(String(content))}</div>
            ${metadata ? `<div class="message-metadata">${metadata}</div>` : ''}
        </div>
    `;
}


function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 7) {
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    } catch (error) {
        return dateString;
    }
}


function formatValue(value) {
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
        return value ? '✓' : '✗';
    }
    return String(value).length > 50 ? String(value).substring(0, 50) + '...' : String(value);
}

// Escape to avoid XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


function filterMessages() {
    const searchTerm = searchInput.value.toLowerCase();
    
    if (!searchTerm) {
        displayMessages(allMessages);
        return;
    }
    
    const filtered = allMessages.filter(msg => {
        return Object.values(msg).some(value => {
            if (value === null || value === undefined) return false;
            return String(value).toLowerCase().includes(searchTerm);
        });
    });
    
    displayMessages(filtered);
}


function updatePagination() {
    pageInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = allMessages.length < currentLimit;
}

function showLoading() {
    loadingSpinner.style.display = 'block';
    messagesContainer.style.display = 'none';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
    messagesContainer.style.display = 'block';
}


function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}
