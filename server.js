const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const distDir = path.join(__dirname, 'dist');
const appDir = path.join(distDir, 'server', 'app');
const nextStaticDir = path.join(distDir, 'static');
const imageStore = new Map();
const MIME_REGEX = /^data:([^;]+);base64,(.+)$/;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use('/_next/static', express.static(nextStaticDir, { maxAge: '1y', immutable: true }));

function sendBuiltPage(res, fileName, statusCode = 200) {
  const filePath = path.join(appDir, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(500).send(`Missing built page: ${fileName}`);
  }

  return res.status(statusCode).sendFile(filePath);
}

function getBaseUrl(req) {
  const publicUrlPath = path.join(__dirname, 'public-url.json');

  if (fs.existsSync(publicUrlPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(publicUrlPath, 'utf8'));
      if (data.url) {
        return {
          ip: data.url,
          isPublic: true,
          publicIp: data.publicIp || '',
        };
      }
    } catch (error) {
      console.error('Failed to read public-url.json', error);
    }
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return {
      ip: process.env.RENDER_EXTERNAL_URL.replace(/\/$/, ''),
      isPublic: true,
      publicIp: '',
    };
  }

  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'] || 'http';

  if (forwardedHost) {
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;

    return {
      ip: `${proto}://${host}`,
      isPublic: true,
      publicIp: '',
    };
  }

  return {
    ip: `http://localhost:${PORT}`,
    isPublic: false,
    publicIp: '',
  };
}

// Example API endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

app.get('/api/network-ip', (req, res) => {
  res.json(getBaseUrl(req));
});

app.post('/api/image', async (req, res) => {
  try {
    const { id, data } = req.body || {};

    if (!id || !data) {
      return res.status(400).json({ error: 'Missing id or data' });
    }

    imageStore.set(id, data);

    setTimeout(() => {
      imageStore.delete(id);
    }, 60 * 60 * 1000);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to upload' });
  }
});

app.get('/api/image', (req, res) => {
  try {
    const id = req.query.id;

    if (typeof id !== 'string' || !imageStore.has(id)) {
      return res.status(404).send('Not found');
    }

    const dataUrl = imageStore.get(id);

    if (!dataUrl) {
      return res.status(404).send('Not found');
    }

    const matches = dataUrl.match(MIME_REGEX);

    if (matches) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      return res
        .status(200)
        .set({
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        })
        .send(buffer);
    }

    return res.status(200).type('text/plain').send(dataUrl);
  } catch (error) {
    return res.status(500).send('Failed to get image');
  }
});

app.get('/', (req, res) => {
  sendBuiltPage(res, 'index.html');
});

app.get('/thumbnail-size', (req, res) => {
  sendBuiltPage(res, 'thumbnail-size.html');
});

app.get('/mobile-scroll', (req, res) => {
  sendBuiltPage(res, 'mobile-scroll.html');
});

app.get('/mobile-scroll/viewer', (req, res) => {
  sendBuiltPage(res, path.join('mobile-scroll', 'viewer.html'));
});

app.get(/.*/, (req, res) => {
  sendBuiltPage(res, '_not-found.html', 404);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
