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
                <td style="color: ${account.is_locked ? 'red' : 'green'}">${account.is_locked ? 'Đã đóng băng' : 'Chưa đóng băng'}</td>
                <td style="color: ${account.token_expired ? 'red' : 'green'}">${account.token_expired ? 'Đã vô hiệu hóa' : 'Chưa vô hiệu hóa'}</td>
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
});

// Cập nhật dữ liệu sau khi form được submit thành công
const updateTables = () => {
    fetchAndDisplayAccounts('f8bet');
};
