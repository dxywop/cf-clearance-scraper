const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const authToken = process.env.authToken || null;
const cors = require('cors');
const reqValidate = require('./module/reqValidate');

global.browserLength = 0;
global.browserLimit = Number(process.env.browserLimit) || 20;
global.timeOut = Number(process.env.timeOut || 60000);

// Middleware setup
app.use(bodyParser.json({}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Bind server to all available network interfaces (0.0.0.0) for external access
if (process.env.NODE_ENV !== 'development') {
    let server = app.listen(port, '0.0.0.0', () => { 
        console.log(`Server running on port ${port}`);
    });

    // Set server timeout
    try {
        server.timeout = global.timeOut;
    } catch (e) { }
}

// If SKIP_LAUNCH environment variable is not set, launch the browser
if (process.env.SKIP_LAUNCH != 'true') require('./module/createBrowser');

// Import routes or endpoints
const getSource = require('./endpoints/getSource');
const solveTurnstileMin = require('./endpoints/solveTurnstile.min');
const solveTurnstileMax = require('./endpoints/solveTurnstile.max');
const wafSession = require('./endpoints/wafSession');

// Main POST route for scraper
app.post('/cf-clearance-scraper', async (req, res) => {
    const data = req.body;

    // Validate request body
    const check = reqValidate(data);
    if (check !== true) return res.status(400).json({ code: 400, message: 'Bad Request', schema: check });

    // Check auth token
    if (authToken && data.authToken !== authToken) return res.status(401).json({ code: 401, message: 'Unauthorized' });

    // Check browser limit
    if (global.browserLength >= global.browserLimit) return res.status(429).json({ code: 429, message: 'Too Many Requests' });

    // Check if the scanner/browser is ready
    if (process.env.SKIP_LAUNCH != 'true' && !global.browser) return res.status(500).json({ code: 500, message: 'The scanner is not ready yet. Please try again a little later.' });

    let result = { code: 500 };

    // Increase global browser length counter
    global.browserLength++;

    // Handle different modes of scraping
    switch (data.mode) {
        case "source":
            result = await getSource(data).then(res => { return { source: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } });
            break;
        case "turnstile-min":
            result = await solveTurnstileMin(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } });
            break;
        case "turnstile-max":
            result = await solveTurnstileMax(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } });
            break;
        case "waf-session":
            result = await wafSession(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: err.message } });
            break;
        default:
            result = { code: 400, message: 'Invalid mode specified' };
            break;
    }

    // Decrease global browser length counter
    global.browserLength--;

    // Send response
    res.status(result.code ?? 500).send(result);
});

// Catch-all route for undefined endpoints
app.use((req, res) => { 
    res.status(404).json({ code: 404, message: 'Not Found' });
});

// Export for development
if (process.env.NODE_ENV == 'development') {
    module.exports = app;
}
