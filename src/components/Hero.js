import React from 'react';

export default function Hero() {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="hero" id="hero">
      <div className="hero-content">
        <h1>Nidhi Malkusare</h1>
        <p>Full Stack Developer | Creative Problem Solver | Tech Enthusiast</p>
        <button className="cta-button" onClick={scrollToContact}>Get In Touch</button>
      </div>
    </section>
  );
}
