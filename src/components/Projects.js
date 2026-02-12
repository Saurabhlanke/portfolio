import React from 'react';

export default function Projects() {
  const projects = [
    {
      id: 1,
      title: 'E-Commerce Platform',
      description: 'A full-featured e-commerce platform built with React and Node.js. Features include product filtering, shopping cart, and secure payment integration.',
      tags: ['React', 'Node.js', 'MongoDB', 'Stripe']
    },
    {
      id: 2,
      title: 'Task Management App',
      description: 'A collaborative task management tool with real-time updates. Users can create projects, assign tasks, and track progress with an intuitive dashboard.',
      tags: ['React', 'Firebase', 'Material-UI', 'Redux']
    },
    {
      id: 3,
      title: 'Weather Dashboard',
      description: 'Real-time weather application featuring current conditions, forecasts, and interactive maps. Built with React and integrated with weather APIs.',
      tags: ['React', 'API Integration', 'D3.js', 'Weather API']
    },
    {
      id: 4,
      title: 'Social Media Analytics',
      description: 'Analytics dashboard for social media metrics. Provides insights on engagement, audience growth, and content performance with beautiful visualizations.',
      tags: ['React', 'Chart.js', 'Express', 'PostgreSQL']
    },
    {
      id: 5,
      title: 'Blog Platform',
      description: 'A modern blogging platform with Markdown support, user authentication, and SEO optimization. Built with Next.js for optimal performance.',
      tags: ['Next.js', 'TypeScript', 'Prisma', 'PostgreSQL']
    },
    {
      id: 6,
      title: 'Fitness Tracker',
      description: 'Mobile-responsive fitness tracking app with workout logging, progress charts, and personalized recommendations using machine learning.',
      tags: ['React Native', 'Firebase', 'ML', 'Redux']
    }
  ];

  return (
    <section className="projects" id="projects">
      <div className="projects-container">
        <h2 className="section-title">My Projects</h2>
        <div className="projects-grid">
          {projects.map((project) => (
            <div key={project.id} className="project-card">
              <h3>{project.title}</h3>
              <p>{project.description}</p>
              <div className="project-tags">
                {project.tags.map((tag, index) => (
                  <span key={index} className="tag">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
