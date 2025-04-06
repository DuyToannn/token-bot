const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.static('./'));

// Kiểm tra MongoDB URL
const mongoUrl = process.env.MONGODB_URL;
if (!mongoUrl) {
    console.error('MONGODB_URL không được định nghĩa trong file .env');
    process.exit(1);
}

// API endpoint
app.post('/api/submit', async (req, res) => {
    let client;
    try {
        // Kết nối MongoDB
        client = await MongoClient.connect(mongoUrl);
        console.log('Đã kết nối thành công với MongoDB');

        const db = client.db('account');

        // Xác định collection dựa trên loại form
        let collection;
        if (req.body.type === 'f8bet') {
            collection = db.collection('f8bet');
        } else {
            throw new Error('Loại form không hợp lệ');
        }

        // Lưu nhiều tài khoản
        const accounts = req.body.accounts || [];
        if (accounts.length === 0) {
            throw new Error('Không có tài khoản nào để lưu');
        }

        const results = [];
        for (const account of accounts) {
            if (!account._account || !account._pat || !account._prt) {
                throw new Error('Thiếu thông tin tài khoản');
            }

            const result = await collection.insertOne({
                _account: account._account,
                _pat: account._pat,
                _prt: account._prt,
                is_locked: false,
                token_expired: false,
                created_at: new Date()
            });
            results.push(result.insertedId);
        }

        res.status(200).json({
            success: true,
            message: `Đã lưu thành công ${results.length} tài khoản ${req.body.type.toUpperCase()}`,
            ids: results
        });

    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lưu dữ liệu',
            error: error.message
        });

    } finally {
        if (client) {
            await client.close();
        }
    }
});

app.get('/api/accounts/:type', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection(req.params.type);

        const accounts = await collection.find({}, {
            projection: {
                _account: 1,
                is_locked: 1,
                token_expired: 1
            }
        }).toArray();

        res.json(accounts);
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lấy dữ liệu',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

app.post('/api/fetch-accounts', async (req, res) => {
    let client;
    try {
        // Fetch accounts from the API
        const apiResponse = await fetch('https://hservice.vn/api.php');
        const apiData = await apiResponse.json();

        console.log('API Response:', apiData);

        if (!apiData || !apiData.data || !Array.isArray(apiData.data) || apiData.data.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không còn tài khoản nào khả dụng',
                data: []
            });
        }

        // Connect to MongoDB
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection('f8bet_accounts');

        // Get existing usernames to check for duplicates
        const existingAccounts = await collection.find({}, { projection: { username: 1 } }).toArray();
        const existingUsernames = new Set(existingAccounts.map(acc => acc.username));

        // Filter out duplicates and store new accounts
        const newAccounts = [];
        for (const account of apiData.data) {
            if (!account.username || !account.password) {
                continue;
            }

            if (!existingUsernames.has(account.username)) {
                const result = await collection.insertOne({
                    username: account.username,
                    password: account.password,
                    created_at: new Date()
                });
                newAccounts.push({
                    _id: result.insertedId,
                    username: account.username,
                    password: account.password,
                    created_at: new Date()
                });
                existingUsernames.add(account.username);
            }
        }

        // Get all accounts after insertion, sorted by creation time
        const allAccounts = await collection.find({})
            .sort({ created_at: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            message: `Đã thêm ${newAccounts.length} tài khoản mới`,
            accounts: allAccounts
        });

    } catch (error) {
        console.error('Lỗi chi tiết:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lấy và lưu tài khoản',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Add endpoint to get API accounts
app.get('/api/api-accounts', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const apiAccountsCollection = db.collection('f8bet_accounts');
        const f8betCollection = db.collection('f8bet');

        // Get all API accounts
        const apiAccounts = await apiAccountsCollection.find({})
            .toArray();

        // Get all used usernames from f8bet collection
        const usedAccounts = await f8betCollection.find({}, { projection: { _account: 1 } }).toArray();
        const usedUsernames = new Set(usedAccounts.map(acc => acc._account));

        // Add is_used field to each API account
        const accountsWithStatus = apiAccounts.map(account => ({
            ...account,
            is_used: usedUsernames.has(account.username)
        }));

        // Sort accounts: unused first, then by creation time (newest first)
        const sortedAccounts = accountsWithStatus.sort((a, b) => {
            // First sort by usage status
            if (a.is_used !== b.is_used) {
                return a.is_used ? 1 : -1; // Unused accounts come first
            }
            // Then sort by creation time
            return new Date(b.created_at) - new Date(a.created_at);
        });

        res.json(sortedAccounts);
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lấy dữ liệu',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Add endpoint to delete a single API account
app.delete('/api/api-accounts/:id', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection('f8bet_accounts');

        // Validate ObjectId
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'ID không hợp lệ'
            });
        }

        const result = await collection.deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tài khoản để xóa'
            });
        }
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi xóa tài khoản',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Add endpoint to delete all API accounts
app.delete('/api/api-accounts', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection('f8bet_accounts');

        const result = await collection.deleteMany({});

        res.json({
            success: true,
            message: `Đã xóa ${result.deletedCount} tài khoản thành công`
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi xóa tài khoản',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    console.log('MongoDB URL:', mongoUrl); // Kiểm tra URL
});