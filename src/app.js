require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
// auth.js
const authRoutes = require('./routes/auth')
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}))
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Bujo backend is running' });
});

// auth.js
app.use('/api/auth', authRoutes)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




