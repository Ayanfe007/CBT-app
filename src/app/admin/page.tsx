const quickLinks = [
  { label: 'Courses', href: '/admin/courses' },
  { label: 'Questions', href: '/admin/questions' },
  { label: 'Students', href: '/admin/students' },
  { label: 'Assignments', href: '/admin/assignments' },
  { label: 'Results', href: '/admin/results' },
];

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Admin Dashboard</h1>
      <p className="text-slate-600 mb-6">
        Welcome. Use the sidebar to manage courses, questions, students,
        assignments, and results.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickLinks.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="p-4 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 hover:border-blue-300 transition"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
