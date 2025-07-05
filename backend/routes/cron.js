
const express = require('express');
const { planDailyPosts, executeDuePost } = require('../services/cronWorker');
const router = express.Router();

// Middleware to protect the cron endpoints
const checkCronSecret = (req, res, next) => {
    const secret = req.header('X-Cron-Secret');
    if (secret === process.env.CRON_SECRET_KEY) {
        next();
    } else {
        res.status(401).send('Unauthorized: Invalid cron secret.');
    }
};

// Endpoint for the PLANNER cron job (runs once a day)
router.post('/plan', checkCronSecret, (req, res) => {
    console.log('PLANNER cron job triggered.');
    // Run in background and respond immediately
    planDailyPosts();
    res.status(202).send('Daily post planning process started.');
});

// Endpoint for the EXECUTOR cron job (runs every few minutes)
router.post('/execute', checkCronSecret, (req, res) => {
    console.log('EXECUTOR cron job triggered.');
    // Run in background and respond immediately
    executeDuePost();
    res.status(202).send('Post execution process started.');
});

module.exports = router;
