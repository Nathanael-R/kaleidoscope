import express from 'express';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = 3001;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Middleware to check auth
const requireAuth = (req, res, next) => {
  if (req.cookies.session_token === 'demo_session_abc123') {
    next();
  } else {
    res.redirect('/login');
  }
};

// Login page
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - Auth Demo</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .login-container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          width: 100%;
          max-width: 400px;
        }
        h1 {
          color: #333;
          margin-bottom: 30px;
          text-align: center;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          color: #555;
          font-weight: 500;
        }
        input {
          width: 100%;
          padding: 12px;
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          transition: border-color 0.3s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
        }
        button {
          width: 100%;
          padding: 14px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.3s;
        }
        button:hover {
          background: #5568d3;
        }
        .hint {
          margin-top: 20px;
          padding: 15px;
          background: #f0f0f0;
          border-radius: 6px;
          font-size: 14px;
          color: #666;
        }
        .hint strong {
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h1>🔐 Login</h1>
        <form method="POST" action="/login">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" placeholder="Enter any username" required>
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Enter any password" required>
          </div>
          <button type="submit">Sign In</button>
        </form>
        <div class="hint">
          <strong>Test Credentials:</strong><br>
          Username: <code>demo</code><br>
          Password: <code>demo</code><br>
          (or use any credentials - all are accepted)
        </div>
      </div>
    </body>
    </html>
  `);
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Accept any credentials for demo purposes
  if (username && password) {
    res.cookie('session_token', 'demo_session_abc123', {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Protected dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dashboard - Auth Demo</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .container {
          max-width: 1200px;
          margin: 40px auto;
          padding: 0 20px;
        }
        .welcome-card {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }
        .welcome-card h1 {
          color: #333;
          margin-bottom: 10px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 30px;
        }
        .stat-card {
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-card h3 {
          color: #667eea;
          margin-bottom: 10px;
        }
        .stat-card .number {
          font-size: 2.5rem;
          font-weight: bold;
          color: #333;
        }
        .logout-btn {
          background: white;
          color: #667eea;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          text-decoration: none;
        }
        .success-badge {
          display: inline-block;
          background: #4ade80;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          margin-top: 10px;
        }
        @media (max-width: 768px) {
          .stats {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h2>📊 Dashboard</h2>
        </div>
        <a href="/logout" class="logout-btn">Logout</a>
      </div>

      <div class="container">
        <div class="welcome-card">
          <h1>✓ Authentication Successful!</h1>
          <p>You are now viewing a protected dashboard. This page requires authentication.</p>
          <div class="success-badge">🔐 Session Active</div>
        </div>

        <div class="stats">
          <div class="stat-card">
            <h3>Total Users</h3>
            <div class="number">1,234</div>
            <p>Active accounts</p>
          </div>

          <div class="stat-card">
            <h3>Revenue</h3>
            <div class="number">$45K</div>
            <p>This month</p>
          </div>

          <div class="stat-card">
            <h3>Projects</h3>
            <div class="number">18</div>
            <p>In progress</p>
          </div>
        </div>
      </div>

      <script>
        // Show session token for testing
        console.log('Session Token:', document.cookie);
        console.log('To test auth in Kaleidoscope, copy this:');
        console.log('Cookie Name: session_token');
        console.log('Cookie Value: demo_session_abc123');
      </script>
    </body>
    </html>
  `);
});

// Protected profile page
app.get('/profile', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Profile - Auth Demo</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #667eea; }
        .nav { margin-bottom: 30px; }
        a { color: #667eea; margin-right: 15px; }
      </style>
    </head>
    <body>
      <div class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/profile">Profile</a>
        <a href="/logout">Logout</a>
      </div>
      <h1>User Profile</h1>
      <p>This is another protected page that requires authentication.</p>
      <p><strong>Username:</strong> demo_user</p>
      <p><strong>Email:</strong> demo@example.com</p>
    </body>
    </html>
  `);
});

// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('session_token');
  res.redirect('/login');
});

// Public home page
app.get('/', (req, res) => {
  const isAuthenticated = req.cookies.session_token === 'demo_session_abc123';
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Auth Demo - Home</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
        }
        h1 { color: #667eea; }
        .status {
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .authenticated { background: #d1fae5; border: 2px solid #4ade80; }
        .not-authenticated { background: #fee2e2; border: 2px solid #f87171; }
        a {
          display: inline-block;
          margin-top: 15px;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 6px;
        }
      </style>
    </head>
    <body>
      <h1>🔐 Auth Demo Site</h1>
      <p>This site demonstrates authentication for Kaleidoscope testing.</p>

      <div class="status ${isAuthenticated ? 'authenticated' : 'not-authenticated'}">
        <strong>Status:</strong> ${isAuthenticated ? '✓ Authenticated' : '✗ Not Authenticated'}
      </div>

      ${isAuthenticated
        ? '<a href="/dashboard">Go to Dashboard</a> <a href="/logout">Logout</a>'
        : '<a href="/login">Login</a>'}
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✓ Auth demo running on http://localhost:${PORT}`);
  console.log(`  Test authentication preview in Kaleidoscope!`);
  console.log(`\n  Pages:`);
  console.log(`  - Home: http://localhost:${PORT}/`);
  console.log(`  - Login: http://localhost:${PORT}/login`);
  console.log(`  - Dashboard: http://localhost:${PORT}/dashboard (requires auth)`);
  console.log(`  - Profile: http://localhost:${PORT}/profile (requires auth)`);
  console.log(`\n  Test credentials: demo / demo`);
});
