import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    hoverable?: boolean;
}

export function Card({ children, className = '', hoverable = false, ...props }: CardProps) {
    return (
        <div 
            className={`glass-card ${className}`} 
            style={hoverable ? { 
                cursor: 'pointer', 
                transition: 'transform 0.18s ease, box-shadow 0.18s ease'
            } : undefined}
            onMouseEnter={hoverable ? (e) => {
                const target = e.currentTarget;
                target.style.transform = 'translateY(-4px)';
                target.style.boxShadow = '0 12px 32px rgba(63,68,80,0.1)';
            } : undefined}
            onMouseLeave={hoverable ? (e) => {
                const target = e.currentTarget;
                target.style.transform = '';
                target.style.boxShadow = '';
                target.style.borderColor = ''; // Relies on inline style removal if set elsewhere
            } : undefined}
            {...props}
        >
            {children}
        </div>
    );
}

export function CardHeader({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`flex items-start justify-between ${className}`} {...props}>
            {children}
        </div>
    );
}
