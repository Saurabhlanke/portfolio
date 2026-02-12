import React from 'react';

export default function Skills() {
  const skills = [
    { category: 'Frontend', items: ['React', 'JavaScript', 'HTML/CSS', 'TypeScript'] },
    { category: 'Backend', items: ['Node.js', 'Express', 'MongoDB', 'PostgreSQL'] },
    { category: 'Tools', items: ['Git', 'Docker', 'Webpack', 'Redux'] },
    { category: 'Soft Skills', items: ['Problem Solving', 'Communication', 'Team Work', 'Leadership'] }
  ];

  return (
    <section className="skills" id="skills">
      <div className="skills-container">
        <h2 className="section-title">Skills & Expertise</h2>
        <div className="skills-grid">
          {skills.map((skillGroup, index) => (
            <div key={index} className="skill-card">
              <h4>{skillGroup.category}</h4>
              <ul style={{ listStyle: 'none' }}>
                {skillGroup.items.map((skill, idx) => (
                  <li key={idx} style={{ marginBottom: '0.5rem', color: '#00d4ff' }}>{skill}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
