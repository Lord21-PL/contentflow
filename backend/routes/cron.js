
const express = require('express');
const { runContentFlow } = require('../services/cronWorker');
const router = express.Router();

// Middleware to protect the cron endpoint
const checkCronSecret = (req, res, next) => {
    const secret = req.header('X-Cron-Secret');
    if (secret === process.env.CRON_SECRET_KEY) {
        next();
    } else {
        res.status(401).send('Unauthorized: Invalid cron secret.');
    }
};

router.post('/run', checkCronSecret, async (req, res) => {
    console.log('Cron job triggered via webhook.');
    try {
        // We run this asynchronously and immediately return a response
        // to prevent the cron service from timing out.
        runContentFlow();
        res.status(202).send('ContentFlow process started.');
    } catch (error) {
        console.error('Failed to start ContentFlow process:', error);
        res.status(500).send('Error starting cron job.');
    }
});

module.exports = router;
