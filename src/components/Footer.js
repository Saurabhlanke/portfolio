import React from 'react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer>
      <p>&copy; {currentYear} My Portfolio. All rights reserved.</p>
      <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Built with React & Love</p>
    </footer>
  );
}
