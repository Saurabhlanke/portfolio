import React from 'react';

export default function Contact() {
  return (
    <section className="contact" id="contact">
      <div className="contact-content">
        <h2>Let's Connect</h2>
        <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
          I'd love to hear from you. Feel free to reach out for collaborations or just a friendly hello!
        </p>
        <div className="contact-links">
          <a href="mailto:your.email@example.com" className="contact-link">Email</a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="contact-link">GitHub</a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="contact-link">LinkedIn</a>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="contact-link">Twitter</a>
        </div>
      </div>
    </section>
  );
}
