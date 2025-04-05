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

        // Lưu dữ liệu
        const result = await collection.insertOne({
            _account: req.body._account, // Lưu tên tài khoản
            _pat: req.body._pat,
            _prt: req.body._prt,
            is_locked: false,
            token_expired: false,
            created_at: new Date()
        });

        res.status(200).json({
            success: true,
            message: `Dữ liệu ${req.body.type.toUpperCase()} đã được lưu thành công`,
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
        const apiResponse = await fetch('https://hservice.vn/api.php?soacc=all');
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

        // Lấy tài khoản đầu tiên từ mảng data
        const account = apiData.data[0];

        if (!account.username || !account.password) {
            throw new Error('Invalid account data format');
        }

        // Store in f8bet collection - lưu username, password và thời gian
        const result = await collection.insertOne({
            username: account.username,
            password: account.password,
            created_at: new Date() // Thêm thời gian tạo
        });

        res.status(200).json({
            success: true,
            message: 'Tài khoản đã được lấy và lưu thành công',
            account: {
                username: account.username,
                password: account.password,
                created_at: new Date() // Thêm thời gian vào response
            }
        });

    } catch (error) {
        console.error('Lỗi chi tiết:', error); // Để debug
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
        const collection = db.collection('f8bet_accounts');

        const accounts = await collection.find({})
            .sort({ created_at: -1 })
            .limit(5)
            .toArray();

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