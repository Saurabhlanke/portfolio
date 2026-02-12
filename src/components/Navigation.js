import React from 'react';

export default function Navigation() {
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav>
      <div className="logo">Portfolio</div>
      <ul>
        <li><button onClick={() => scrollToSection('hero')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '1rem' }}>Home</button></li>
        <li><button onClick={() => scrollToSection('about')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '1rem' }}>About</button></li>
        <li><button onClick={() => scrollToSection('projects')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '1rem' }}>Projects</button></li>
        <li><button onClick={() => scrollToSection('skills')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '1rem' }}>Skills</button></li>
        <li><button onClick={() => scrollToSection('contact')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '1rem' }}>Contact</button></li>
      </ul>
    </nav>
  );
}
