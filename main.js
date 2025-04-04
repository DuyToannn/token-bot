// Handle F8BET form submission
document.getElementById('f8betForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        _account: document.getElementById('f8bet_account').value,
        _pat: document.getElementById('f8bet_pat').value,
        _prt: document.getElementById('f8bet_prt').value,
        type: 'f8bet'
    };

    try {
        const response = await fetch('/api/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            alert('Dữ liệu F8BET đã được lưu thành công!');
            document.getElementById('f8betForm').reset();
            await fetchAndDisplayAccounts('f8bet');
        } else {
            alert('Có lỗi xảy ra khi lưu dữ liệu F8BET!');
        }
    } catch (error) {
        console.error('Lỗi:', error);
        alert('Có lỗi xảy ra khi lưu dữ liệu F8BET!');
    }
});

async function fetchAndDisplayAccounts(type) {
    try {
        const response = await fetch(`/api/accounts/${type}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const accounts = await response.json();
        
        const tbody = document.querySelector(`#${type}Table tbody`);
        tbody.innerHTML = '';
        
        // Sort accounts to show newest first
        accounts.sort((a, b) => {
            // Assuming _id contains timestamp, newer items have larger _id
            return b._id?.localeCompare(a._id);
        });
        
        // Only display the 5 newest accounts
        accounts.slice(0, 5).forEach(account => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${account._account}</td>
                <td style="color: ${account.is_locked ? 'red' : 'green'}">${account.is_locked ? 'Đã Khóa' : 'Chưa khóa'}</td>
                <td style="color: ${account.token_expired ? 'red' : 'green'}">${account.token_expired ? 'Đã đăng xuất' : 'Chưa đăng xuất'}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching accounts:', error);
    }
}

// Lấy dữ liệu khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayAccounts('f8bet');
    fetchAndDisplayApiAccounts();
});

// Fetch and display API accounts
async function fetchApiAccounts() {
    try {
        const response = await fetch('/api/api-accounts');
        if (!response.ok) throw new Error('Network response was not ok');
        const accounts = await response.json();
        
        const tbody = document.querySelector('#apiAccountsTable tbody');
        tbody.innerHTML = '';
        
        accounts.forEach(account => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${account.username}</td>
                <td>${account.password}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching API accounts:', error);
    }
}

// Cập nhật event listener cho fetchAccountsBtn
document.addEventListener('DOMContentLoaded', () => {
    const fetchAccountsBtn = document.getElementById('fetchAccountsBtn');
    if (fetchAccountsBtn) {
        // Xóa tất cả event listener cũ (nếu có)
        const newBtn = fetchAccountsBtn.cloneNode(true);
        fetchAccountsBtn.replaceWith(newBtn);
        
        // Đăng ký event listener mới
        newBtn.addEventListener('click', async () => {
            try {
                // Hiển thị trạng thái đang tải
                newBtn.textContent = 'Đang lấy tài khoản...';
                newBtn.disabled = true;
                
                const response = await fetch('/api/fetch-accounts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const result = await response.json();
                console.log('API Response:', result);

                if (response.ok && result.success) {
                    // Cập nhật cả hai bảng ngay lập tức
                    await Promise.all([
                        fetchAndDisplayAccounts('f8bet'),
                        fetchAndDisplayApiAccounts()
                    ]);
                    alert(result.message);
                } else {
                    alert(`Lỗi: ${result.message}\n${result.error || ''}`);
                }
            } catch (error) {
                console.error('Lỗi:', error);
                alert(`Lỗi: ${error.message}`);
            } finally {
                // Khôi phục trạng thái nút
                newBtn.textContent = 'Lấy tài khoản mới';
                newBtn.disabled = false;
            }
        });
    }
});

async function fetchAndDisplayApiAccounts() {
    try {
        const response = await fetch('/api/api-accounts');
        if (!response.ok) throw new Error('Network response was not ok');
        const accounts = await response.json();
        
        const tbody = document.querySelector('#apiAccountsTable tbody');
        tbody.innerHTML = '';
        
        accounts.forEach(account => {
            const row = document.createElement('tr');
            const date = new Date(account.created_at).toLocaleString();
            row.innerHTML = `
                <td>${account.username}</td>
                <td>${account.password}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching API accounts:', error);
    }
}
