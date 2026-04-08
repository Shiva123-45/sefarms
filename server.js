require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

const twilio = require('twilio');
const JWT_SECRET = process.env.JWT_SECRET || 'farm-management-secret';

// --- Lightning-Fast In-Memory Database ---
// This replaces Mongoose/MongoDB to ensure instant startup without large downloads.
const DB = {
    users: [],
    crops: [],
    livestock: [],
    inventory: [],
    income: []
};

// Simple ID Generator
const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Twilio Setup ---
let twilioClient = null;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        if (process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
            twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        } else {
            console.error("\n!!! [CONFIG ERROR] Twilio Account SID must start with 'AC'. Found: " + process.env.TWILIO_ACCOUNT_SID.substring(0,2) + "... !!!\n");
        }
    }
} catch (err) {
    console.error("\n!!! [CONFIG ERROR] Failed to initialize Twilio client:", err.message, "\n");
}

const sendSMS = async (to, body) => {
    // Determine the full destination number
    let fullTo = to;
    if (!to.startsWith('+')) {
        if (to.length === 10) {
            fullTo = `+91${to}`;
        } else {
            console.warn(`[SMS WARNING] Number ${to} is not 10 digits and has no +. Sending as-is.`);
        }
    }

    if (!twilioClient) {
        console.log(`\n!!! [SMS FALLBACK] Demo Code available !!!`);
        console.log(`[MASTER CODE]: 123456 (Works for all numbers)`);
        console.log(`[REAL OTP FOR ${to}]: ${body.match(/\d{6}/)?.[0]}`);
        return { success: true, simulated: true };
    }
    try {
        await twilioClient.messages.create({
            body: body,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: fullTo
        });
        console.log(`[SMS] Actually sent to ${fullTo} via Twilio`);
        return { success: true };
    } catch (err) {
        console.error(`[SMS ERROR] Twilio failed for ${fullTo}:`, err.message);
        return { success: false, error: err.message };
    }
};

const OTP_STORE = new Map();

// --- Auth Routes ---
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    // Allow more flexible phone lengths (up to 15 digits or with +)
    if (!phone || phone.length < 10) return res.status(400).json({ message: 'Invalid phone number' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 5 * 60 * 1000;
    OTP_STORE.set(phone, { otp, expiry });

    const smsText = `Your Sefarm login code is: ${otp}. Namaskar!`;
    const result = await sendSMS(phone, smsText);

    if (result.success) {
        res.json({ 
            message: result.simulated ? 'Demo Mode: Use 123456' : 'OTP sent successfully!',
        });
    } else {
        // Log the error for the dev, but return SUCCESS to the frontend
        // so they can proceed to enter the Master Code (123456)
        console.warn(`[DEMO FALLBACK] Twilio failed for ${phone}: ${result.error}. Allowing demo login.`);
        res.json({ 
            message: 'Master Demo Mode: Use code 123456',
            suggestion: 'Twilio Trial error occurred, but you can still log in for this demo.'
        });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    const { phone, otp } = req.body;
    
    // MASTER BYPASS for Demo
    if (otp === '123456') {
        console.log(`[DEMO] Master Code used for ${phone}. Bypassing SMS check.`);
    } else {
        const record = OTP_STORE.get(phone);
        if (!record || record.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
        OTP_STORE.delete(phone);
    }

    let user = DB.users.find(u => u.phone === phone);
    if (!user) {
        user = { _id: generateId(), phone };
        DB.users.push(user);
    }

    const token = jwt.sign({ userId: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'UP', twilio: twilioClient ? 'CONFIGURED' : 'CONSOLE_MODE' });
});

// --- Generic CRUD Routes ---
const routes = ['crops', 'livestock', 'inventory', 'income'];
routes.forEach(route => {
    app.get(`/api/${route}`, (req, res) => res.json(DB[route]));
    app.post(`/api/${route}`, (req, res) => {
        const item = { ...req.body, _id: generateId(), createdAt: new Date() };
        DB[route].push(item);
        res.json(item);
    });
    app.put(`/api/${route}/:id`, (req, res) => {
        const index = DB[route].findIndex(i => i._id === req.params.id);
        if (index === -1) return res.status(404).json({ message: 'Not found' });
        DB[route][index] = { ...DB[route][index], ...req.body };
        res.json(DB[route][index]);
    });
    app.delete(`/api/${route}/:id`, (req, res) => {
        DB[route] = DB[route].filter(i => i._id !== req.params.id);
        res.json({ message: 'Deleted' });
    });
});

// --- Crop Yields ---
app.get('/api/crops/:id/yields', (req, res) => {
    const crop = DB.crops.find(c => c._id === req.params.id);
    res.json(crop?.yieldRecords || []);
});

app.post('/api/crops/:id/yields', (req, res) => {
    const crop = DB.crops.find(c => c._id === req.params.id);
    if (!crop) return res.status(404).json({ message: 'Crop not found' });
    if (!crop.yieldRecords) crop.yieldRecords = [];
    
    const record = { ...req.body, _id: generateId() };
    crop.yieldRecords.push(record);
    res.json(record);
});

app.delete('/api/crops/:cropId/yields/:yieldId', (req, res) => {
    const crop = DB.crops.find(c => c._id === req.params.cropId);
    if (crop) crop.yieldRecords = crop.yieldRecords.filter(y => y._id !== req.params.yieldId);
    res.json({ message: 'Deleted' });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Farm System Backend is INSTANTLY LIVE on port ${PORT}!`);
    console.log(`📡 Ready for your Twilio OTP calls.\n`);
});
