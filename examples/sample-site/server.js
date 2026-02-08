import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Home page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sample Site - Kaleidoscope Test</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.6;
          color: #333;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 60px 20px;
          text-align: center;
        }

        header h1 {
          font-size: 3rem;
          margin-bottom: 10px;
        }

        nav {
          background: #333;
          color: white;
          padding: 15px 0;
        }

        nav ul {
          list-style: none;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
        }

        nav li {
          margin: 0 20px;
        }

        nav a {
          color: white;
          text-decoration: none;
          transition: color 0.3s;
        }

        nav a:hover {
          color: #667eea;
        }

        .content {
          padding: 40px 20px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 30px;
          margin-top: 40px;
        }

        .card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          padding: 30px;
          transition: transform 0.3s, box-shadow 0.3s;
        }

        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 12px rgba(0,0,0,0.15);
        }

        .card h3 {
          color: #667eea;
          margin-bottom: 15px;
        }

        footer {
          background: #333;
          color: white;
          text-align: center;
          padding: 30px;
          margin-top: 60px;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          header h1 {
            font-size: 2rem;
          }

          nav ul {
            flex-direction: column;
            align-items: center;
          }

          nav li {
            margin: 10px 0;
          }

          .grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <header>
        <h1>🌈 Sample Test Site</h1>
        <p>This is a responsive test site for Kaleidoscope</p>
      </header>

      <nav>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/about">About</a></li>
          <li><a href="/products">Products</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </nav>

      <div class="container content">
        <h2>Welcome to the Sample Site</h2>
        <p>This site is designed to test Kaleidoscope's multi-device preview feature. Try viewing it on different device sizes!</p>

        <div class="grid">
          <div class="card">
            <h3>📱 Mobile First</h3>
            <p>This site is built with responsive design principles. Check how it looks on iPhone, Galaxy, and Pixel devices.</p>
          </div>

          <div class="card">
            <h3>💻 Desktop Ready</h3>
            <p>The layout adapts beautifully to desktop screens, making use of larger viewports effectively.</p>
          </div>

          <div class="card">
            <h3>📐 Tablet Optimized</h3>
            <p>iPad and iPad Pro views show an intermediate layout that works great for touch interfaces.</p>
          </div>
        </div>
      </div>

      <footer>
        <p>&copy; 2024 Kaleidoscope Sample Site. Built for testing responsive design.</p>
      </footer>
    </body>
    </html>
  `);
});

// About page
app.get('/about', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>About - Sample Site</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #667eea; }
        a { color: #667eea; }
      </style>
    </head>
    <body>
      <h1>About This Site</h1>
      <p>This is a test site for Kaleidoscope's multi-device preview feature.</p>
      <p><a href="/">← Back to Home</a></p>
    </body>
    </html>
  `);
});

// Products page
app.get('/products', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Products - Sample Site</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 50px auto; padding: 20px; }
        .products { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .product { border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
        h1 { color: #667eea; }
        a { color: #667eea; }
      </style>
    </head>
    <body>
      <h1>Products</h1>
      <div class="products">
        <div class="product"><h3>Product 1</h3><p>Description of product 1</p></div>
        <div class="product"><h3>Product 2</h3><p>Description of product 2</p></div>
        <div class="product"><h3>Product 3</h3><p>Description of product 3</p></div>
      </div>
      <p><a href="/">← Back to Home</a></p>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✓ Sample site running on http://localhost:${PORT}`);
  console.log(`  Open Kaleidoscope and preview this URL!`);
});
