# My Portfolio Website

A modern, responsive portfolio website built with React featuring smooth animations, multiple sections, and a beautiful gradient design.

## Features

- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Smooth Animations**: Elegant transitions and hover effects
- **Multiple Sections**:
  - Hero section with call-to-action
  - About me section
  - Project showcase with tags
  - Skills & expertise grid
  - Contact section with social links
  - Footer
- **Modern UI**: Glassmorphism design with gradient backgrounds
- **Navigation**: Smooth scroll navigation between sections

## Project Structure

```
src/
├── components/
│   ├── Navigation.js      # Navigation bar with smooth scrolling
│   ├── Hero.js            # Hero section with CTA button
│   ├── About.js           # About me section
│   ├── Projects.js        # Projects showcase
│   ├── Skills.js          # Skills grid
│   ├── Contact.js         # Contact information
│   └── Footer.js          # Footer component
├── styles/
│   └── App.css            # Main stylesheet with responsive design
├── App.js                 # Main app component
├── index.js               # Entry point
└── index.css              # Global styles
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Navigate to the project directory:
```bash
cd /Users/saurabhlanke/Desktop/portfolio
```

2. Install dependencies:
```bash
npm install
```

### Development

Start the development server:
```bash
npm start
```

The app will open at `http://localhost:3000` in your browser.

### Production Build

Create an optimized production build:
```bash
npm run build
```

This creates a `build` folder with optimized files ready for deployment.

## Customization

### Update Personal Information

Edit the components to add your information:

- **Hero Section**: Update [Hero.js](src/components/Hero.js)
- **About Section**: Update [About.js](src/components/About.js)
- **Projects**: Modify the projects array in [Projects.js](src/components/Projects.js)
- **Skills**: Update skills categories in [Skills.js](src/components/Skills.js)
- **Contact**: Update links in [Contact.js](src/components/Contact.js)

### Styling

All styles are in [App.css](src/styles/App.css). Customize:
- Colors (currently using `#00d4ff` as primary color)
- Fonts and typography
- Animations and transitions
- Responsive breakpoints

## Deployment Options

### Option 1: Netlify (Recommended)

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Build the project:
```bash
npm run build
```

3. Deploy:
```bash
netlify deploy --prod --dir=build
```

### Option 2: Vercel

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel --prod
```

### Option 3: GitHub Pages

1. Add to `package.json`:
```json
"homepage": "https://yourusername.github.io/portfolio",
```

2. Install gh-pages:
```bash
npm install --save-dev gh-pages
```

3. Add deploy scripts to `package.json`:
```json
"predeploy": "npm run build",
"deploy": "gh-pages -d build"
```

4. Deploy:
```bash
npm run deploy
```

### Option 4: Serve Locally

1. Install serve:
```bash
npm install -g serve
```

2. Serve the build:
```bash
serve -s build
```

The app will be available at `http://localhost:3000`

### Option 5: Traditional Web Hosting

1. Build the project:
```bash
npm run build
```

2. Upload the contents of the `build` folder to your web hosting provider using FTP or their file manager

3. Set your index.html as the default document

## Technologies Used

- **React 18**: JavaScript library for building user interfaces
- **React Scripts**: Build tool for Create React App
- **CSS3**: For styling and animations
- **HTML5**: Semantic markup

## Available Scripts

- `npm start`: Runs the app in development mode
- `npm run build`: Builds the app for production
- `npm test`: Runs the test suite
- `npm run eject`: Ejects from Create React App (irreversible)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance

The production build includes:
- Code splitting
- Minified CSS and JavaScript
- Optimized bundle size (~62.8 kB gzipped)
- Lazy loading for better performance

## Tips for Enhancement

1. **Add Images**: Add a profile picture to the hero section
2. **Add Project Links**: Add GitHub/demo links to project cards
3. **Form Integration**: Add contact form using services like Formspree or EmailJS
4. **Blog Section**: Add a blog section for your articles
5. **Dark Mode Toggle**: Implement theme switching
6. **Analytics**: Add Google Analytics for tracking

## License

This project is open source and available under the MIT License.

## Support

For issues or questions, feel free to reach out!

---

**Happy coding!** 🚀
