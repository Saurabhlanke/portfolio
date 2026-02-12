# Deployment Guide

This guide provides step-by-step instructions to deploy your portfolio to various hosting platforms.

## Quick Start - Local Development

```bash
# Start development server
npm start

# Visit http://localhost:3000
```

## Building for Production

```bash
# Create optimized production build
npm run build

# The build folder contains all files ready for deployment
```

## Deployment Platforms

### 1. **Netlify** (Recommended - Easiest)

#### Method A: Using Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build the project
npm run build

# Deploy
netlify deploy --prod --dir=build
```

#### Method B: Git Integration (via Netlify Dashboard)

1. Push your code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Click "New site from Git"
4. Select your repository
5. Build command: `npm run build`
6. Publish directory: `build`
7. Deploy!

### 2. **Vercel** (Zero-config deployment)

#### Method A: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Method B: Git Integration

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your repository
5. Vercel auto-detects React - just click "Deploy"

### 3. **GitHub Pages**

```bash
# 1. Edit package.json and add:
# "homepage": "https://yourusername.github.io/portfolio"

# 2. Install gh-pages
npm install --save-dev gh-pages

# 3. Add to package.json scripts:
# "predeploy": "npm run build",
# "deploy": "gh-pages -d build"

# 4. Deploy
npm run deploy

# 5. Enable GitHub Pages in repository settings
```

### 4. **AWS S3 + CloudFront**

```bash
# Build the project
npm run build

# Install AWS CLI
brew install awscli  # macOS
# or download from https://aws.amazon.com/cli/

# Configure AWS credentials
aws configure

# Upload to S3
aws s3 sync build/ s3://your-bucket-name --delete

# CloudFront will serve it automatically if configured
```

### 5. **Firebase Hosting**

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Build the project
npm run build

# Login to Firebase
firebase login

# Initialize Firebase
firebase init hosting

# Deploy
firebase deploy
```

### 6. **Traditional Web Hosting (Bluehost, GoDaddy, etc.)**

1. Build the project:
   ```bash
   npm run build
   ```

2. Connect via FTP/File Manager:
   - Access your hosting provider's file manager
   - Upload all files from the `build` folder to your public_html directory

3. Configure server:
   - Set `index.html` as the default document
   - Ensure .htaccess routing for React Router (if using routing):
   ```
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

### 7. **Docker Deployment**

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine
RUN npm install -g serve
COPY --from=build /app/build /app/build
WORKDIR /app
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
```

Build and run:

```bash
docker build -t my-portfolio .
docker run -p 3000:3000 my-portfolio
```

### 8. **Google Cloud Run**

```bash
# Create app.yaml
cat > app.yaml << EOF
runtime: nodejs18
env: standard
handlers:
- url: /.*
  script: auto
EOF

# Deploy
gcloud app deploy
```

## Environment Setup

### For Netlify/Vercel with GitHub

1. Fork or create repository
2. Connect to platform
3. Platform automatically builds and deploys on push

### For Heroku

```bash
# Create Heroku app
heroku create your-app-name

# Deploy
git push heroku main
```

## Custom Domain

Most platforms allow custom domains:

1. Register domain (GoDaddy, Namecheap, etc.)
2. Point nameservers to hosting platform
3. Add domain in platform dashboard
4. Configure SSL certificate (usually auto)

### Common DNS Configurations:

**For Netlify:**
- Add CNAME record pointing to your Netlify domain

**For Vercel:**
- Point nameservers to Vercel
- Or add CNAME records

**For GitHub Pages:**
- Add CNAME file with your domain
- Update DNS records

## Performance Optimization

After deployment, optimize for performance:

1. **Enable Gzip Compression** (most platforms do by default)
2. **Add CDN** (CloudFlare, CloudFront)
3. **Lazy Load Components**
4. **Optimize Images** (use next/image or similar)
5. **Enable Caching Headers**

## Monitoring

Monitor your deployment:

- Netlify Analytics
- Vercel Analytics
- Google Analytics
- Sentry (for error tracking)

## Troubleshooting

### Blank Page After Deploy

- Check build output for errors
- Verify public folder is deployed
- Check browser console for errors
- Ensure correct homepage in package.json

### 404 on Refresh

- Add routing redirect (common for SPAs)
- Contact hosting support for .htaccess configuration

### Build Fails

- Check Node version compatibility
- Verify all dependencies are in package.json
- Check environment variables needed

## Environment Variables

For sensitive data (API keys, etc.):

1. **Local Development**: Create `.env` file
2. **Deployment**: Add in platform's environment settings

```bash
# .env example
REACT_APP_API_KEY=your_key_here
```

Access in code: `process.env.REACT_APP_API_KEY`

## Next Steps

1. Choose your deployment platform
2. Follow the specific instructions
3. Test your deployed site
4. Add custom domain
5. Set up monitoring

For questions on specific platforms, check their documentation!
