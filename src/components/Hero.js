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
        <h1>Welcome to My Portfolio</h1>
        <p>Full Stack Developer | React Enthusiast | Problem Solver</p>
        <button className="cta-button" onClick={scrollToContact}>Get In Touch</button>
      </div>
    </section>
  );
}
