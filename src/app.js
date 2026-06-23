require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
// auth.js
const authRoutes = require('./routes/auth')

const app = express();


app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}))
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ message: 'Bujo backend is running' });
});

// auth.js
app.use('/api/auth', authRoutes)

module.exports = app;


