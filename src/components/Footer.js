import React from 'react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer>
      <p>&copy; {currentYear} Nidhi Malkusare. All rights reserved.</p>
      <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Built with React & Passion</p>
    </footer>
  );
}
