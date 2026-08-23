/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './index.tsx',
        './App.tsx',
        './components/**/*.{ts,tsx}',
        './context/**/*.{ts,tsx}',
        './hooks/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                'brand-red': '#D32F2F',
                'bg-primary': 'var(--bg-primary)',
                'bg-secondary': 'var(--bg-secondary)',
                'bg-tertiary': 'var(--bg-tertiary)',
                'text-primary': 'var(--text-primary)',
                'text-secondary': 'var(--text-secondary)',
                'text-muted': 'var(--text-muted)',
                'border-color': 'var(--border-color)',
                'glass-bg': 'var(--glass-bg)',
                'glass-border': 'var(--glass-border)',
                'status-green-bg': 'var(--status-green-bg)',
                'status-green-text': 'var(--status-green-text)',
                'status-red-bg': 'var(--status-red-bg)',
                'status-red-text': 'var(--status-red-text)',
                'status-yellow-bg': 'var(--status-yellow-bg)',
                'status-yellow-text': 'var(--status-yellow-text)',
                'status-blue-bg': 'var(--status-blue-bg)',
                'status-blue-text': 'var(--status-blue-text)',
                'status-purple-bg': 'var(--status-purple-bg)',
                'status-purple-text': 'var(--status-purple-text)',
            },
        },
    },
    plugins: [],
};
