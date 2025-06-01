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

// Cấu hình cho từng loại
const CONFIG = {
    f8bet: {
        collection: 'f8bet',
        api_collection: 'f8bet_accounts',
        api_url: 'https://hservice.vn/api.php'
    },
    j88: {
        collection: 'j88_2',
        api_collection: 'j88_accounts',
        api_url: 'https://hservice.vn/api2.php'
    }
};

// API endpoint
app.post('/api/submit', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        console.log('Đã kết nối thành công với MongoDB');

        const db = client.db('account');
        const type = req.body.type;

        if (!CONFIG[type]) {
            throw new Error('Loại form không hợp lệ');
        }

        const collection = db.collection(CONFIG[type].collection);
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
            message: `Đã lưu thành công ${results.length} tài khoản ${type.toUpperCase()}`,
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
        if (client) await client.close();
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
        if (client) await client.close();
    }
});

async function fetchAndSaveAccounts(type, req, res) {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const mainCollection = db.collection(CONFIG[type].collection);
        const apiCollection = db.collection(CONFIG[type].api_collection);

        // Get used accounts
        const usedAccounts = await mainCollection.find({}, { projection: { _account: 1 } }).toArray();
        const usedUsernames = new Set(usedAccounts.map(acc => acc._account));

        // Fetch from API
        const apiResponse = await fetch(CONFIG[type].api_url);
        const apiData = await apiResponse.json();

        console.log(`API Response ${type.toUpperCase()}:`, apiData);

        if (!apiData?.data?.length) {
            return res.status(400).json({
                success: false,
                message: 'Không còn tài khoản nào khả dụng',
                data: []
            });
        }

        // Filter unused accounts
        const unusedApiAccounts = apiData.data.filter(account => 
            account.username && account.password && !usedUsernames.has(account.username)
        );

        if (unusedApiAccounts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không còn tài khoản mới nào khả dụng',
                data: []
            });
        }

        // Check duplicates
        const existingAccounts = await apiCollection.find({}, { projection: { username: 1 } }).toArray();
        const existingUsernames = new Set(existingAccounts.map(acc => acc.username));

        // Save new accounts
        const newAccounts = [];
        for (const account of unusedApiAccounts) {
            if (!existingUsernames.has(account.username)) {
                const result = await apiCollection.insertOne({
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

        const allAccounts = await apiCollection.find({}).sort({ created_at: -1 }).toArray();

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
        if (client) await client.close();
    }
}

app.post('/api/fetch-accounts', (req, res) => fetchAndSaveAccounts('f8bet', req, res));
app.post('/api/fetch-accounts-j88', (req, res) => fetchAndSaveAccounts('j88', req, res));

async function getApiAccounts(type, req, res) {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const apiCollection = db.collection(CONFIG[type].api_collection);
        const mainCollection = db.collection(CONFIG[type].collection);

        const apiAccounts = await apiCollection.find({}).toArray();
        const usedAccounts = await mainCollection.find({}, { projection: { _account: 1 } }).toArray();
        const usedUsernames = new Set(usedAccounts.map(acc => acc._account));

        const accountsWithStatus = apiAccounts.map(account => ({
            ...account,
            is_used: usedUsernames.has(account.username)
        }));

        const sortedAccounts = accountsWithStatus.sort((a, b) => {
            if (a.is_used !== b.is_used) return a.is_used ? 1 : -1;
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
        if (client) await client.close();
    }
}

app.get('/api/api-accounts', (req, res) => getApiAccounts('f8bet', req, res));
app.get('/api/api-accounts-j88', (req, res) => getApiAccounts('j88', req, res));

async function deleteUsedAccounts(type, req, res) {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const apiCollection = db.collection(CONFIG[type].api_collection);
        const mainCollection = db.collection(CONFIG[type].collection);

        const usedAccounts = await mainCollection.find({}, { projection: { _account: 1 } }).toArray();
        const usedUsernames = new Set(usedAccounts.map(acc => acc._account));

        if (usedUsernames.size === 0) {
            return res.status(200).json({
                success: true,
                message: 'Không có tài khoản nào đã sử dụng để xóa'
            });
        }

        const result = await apiCollection.deleteMany({
            username: { $in: Array.from(usedUsernames) }
        });

        res.status(200).json({
            success: true,
            message: `Đã xóa ${result.deletedCount} tài khoản đã sử dụng thành công`
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi xóa tài khoản đã sử dụng',
            error: error.message
        });
    } finally {
        if (client) await client.close();
    }
}

app.delete('/api/api-accounts/used', (req, res) => deleteUsedAccounts('f8bet', req, res));
app.delete('/api/api-accounts-j88/used', (req, res) => deleteUsedAccounts('j88', req, res));

async function deleteApiAccount(type, req, res) {
    let client;
    try {
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection(CONFIG[type].api_collection);

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

        res.json({
            success: true,
            message: 'Đã xóa tài khoản thành công'
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi xóa tài khoản',
            error: error.message
        });
    } finally {
        if (client) await client.close();
    }
}

app.delete('/api/api-accounts/:id', (req, res) => deleteApiAccount('f8bet', req, res));
app.delete('/api/api-accounts-j88/:id', (req, res) => deleteApiAccount('j88', req, res));

// API cho bên thứ 2 gửi tài khoản lên
app.post('/api/external/submit', async (req, res) => {
    let client;
    try {
        const { type, _account, _pat, _prt } = req.body;
        if (!type || !_account || !_pat || !_prt) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin type, _account, _pat hoặc _prt'
            });
        }
        if (!CONFIG[type]) {
            return res.status(400).json({
                success: false,
                message: 'Loại tài khoản không hợp lệ'
            });
        }
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection(CONFIG[type].collection);
        // Kiểm tra trùng tài khoản
        const existed = await collection.findOne({ _account });
        if (existed) {
            return res.status(409).json({
                success: false,
                message: 'Tài khoản đã tồn tại'
            });
        }
        const result = await collection.insertOne({
            _account,
            _pat,
            _prt,
            is_locked: false,
            token_expired: false,
            created_at: new Date()
        });
        res.status(201).json({
            success: true,
            message: 'Đã lưu tài khoản thành công',
            id: result.insertedId
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lưu dữ liệu',
            error: error.message
        });
    } finally {
        if (client) await client.close();
    }
});

app.post('/api/external/j88-accounts', async (req, res) => {
    let client;
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu username hoặc password'
            });
        }
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection('j88_accounts');
        // Kiểm tra trùng username
        const existed = await collection.findOne({ username });
        if (existed) {
            return res.status(409).json({
                success: false,
                message: 'Tài khoản đã tồn tại'
            });
        }
        const result = await collection.insertOne({
            username,
            password,
            created_at: new Date()
        });
        res.status(201).json({
            success: true,
            message: 'Đã thêm tài khoản J88 API thành công',
            id: result.insertedId
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lưu dữ liệu',
            error: error.message
        });
    } finally {
        if (client) await client.close();
    }
});

app.post('/api/external/f8bet-accounts', async (req, res) => {
    let client;
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu username hoặc password'
            });
        }
        client = await MongoClient.connect(mongoUrl);
        const db = client.db('account');
        const collection = db.collection('f8bet_accounts');
        // Kiểm tra trùng username
        const existed = await collection.findOne({ username });
        if (existed) {
            return res.status(409).json({
                success: false,
                message: 'Tài khoản đã tồn tại'
            });
        }
        const result = await collection.insertOne({
            username,
            password,
            created_at: new Date()
        });
        res.status(201).json({
            success: true,
            message: 'Đã thêm tài khoản F8BET API thành công',
            id: result.insertedId
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lưu dữ liệu',
            error: error.message
        });
    } finally {
        if (client) await client.close();
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    console.log('MongoDB URL:', mongoUrl);
});